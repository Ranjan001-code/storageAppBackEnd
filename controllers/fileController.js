import path from "path";
import Directory from "../models/directoryModel.js";
import File from "../models/fileModel.js";
import User from "../models/userModel.js";
import {
  createUploadSignedUrl,
  deleteS3File,
  getS3FileMetaData,
} from "../services/s3.js";
import { createCloudFrontGetSignedUrl } from "../services/cloudfront.js";

export async function updateDirectoriesSize(parentId, deltaSize) {
  while (parentId) {
    const dir = await Directory.findById(parentId);
    if (!dir) break;
    dir.size += deltaSize;
    await dir.save();
    parentId = dir.parentDirId;
  }
}

export const getFile = async (req, res) => {
  const { id } = req.params;
  const query = req.user.role === "Admin" ? { _id: id } : { _id: id, userId: req.user._id };
  const fileData = await File.findOne(query).lean();
  // Check if file exists
  if (!fileData) {
    return res.status(404).json({ error: "File not found!" });
  }

  if (req.query.action === "download") {
    const fileUrl = createCloudFrontGetSignedUrl({
      key: `${id}${fileData.extension}`,
      download: true,
      filename: fileData.name,
    });
    console.log("Download URL:");
    return res.redirect(fileUrl);
  }

  // Send file
  const fileUrl = createCloudFrontGetSignedUrl({
    key: `${id}${fileData.extension}`,
    filename: fileData.name,
  });

  console.log("view URL:");
  return res.redirect(fileUrl);
};

export const renameFile = async (req, res, next) => {
  const { id } = req.params;
  const query = req.user.role === "Admin" ? { _id: id } : { _id: id, userId: req.user._id };
  const file = await File.findOne(query);

  // Check if file exists
  if (!file) {
    return res.status(404).json({ error: "File not found!" });
  }

  try {
    file.name = req.body.newFilename;
    await file.save();
    return res.status(200).json({ message: "Renamed" });
  } catch (err) {
    console.log(err);
    err.status = 500;
    next(err);
  }
};

export const deleteFile = async (req, res, next) => {
  const { id } = req.params;
  const query = req.user.role === "Admin" ? { _id: id } : { _id: id, userId: req.user._id };
  const file = await File.findOne(query);

  if (!file) {
    return res.status(404).json({ error: "File not found!" });
  }

  try {
    await file.deleteOne();
    await updateDirectoriesSize(file.parentDirId, -file.size);
    await deleteS3File(`${file.id}${file.extension}`);
    return res.status(200).json({ message: "File Deleted Successfully" });
  } catch (err) {
    next(err);
  }
};

export const uploadInitiate = async (req, res, next) => {
  const parentDirId = req.body.parentDirId || req.user.rootDirId;
  try {
    const query = req.user.role === "Admin" ? { _id: parentDirId } : { _id: parentDirId, userId: req.user._id };
    const parentDirData = await Directory.findOne(query);

    // Check if parent directory exists
    if (!parentDirData) {
      return res.status(404).json({ error: "Parent directory not found!" });
    }

    const filename = req.body.name || "untitled";
    const filesize = req.body.size;

    const ownerId = parentDirData.userId;
    const user = await User.findById(ownerId);
    const rootDir = await Directory.findById(user.rootDirId);

    const remainingSpace = user.maxStorageInBytes - rootDir.size;

    if (filesize > remainingSpace) {
      console.log("File too large");
      return res.status(507).json({ error: "Not enough storage." });
    }

    const extension = path.extname(filename);
    const insertedFile = await File.create({
      extension,
      name: filename,
      size: filesize,
      parentDirId: parentDirData._id,
      userId: ownerId,
      isUploading: true,
    });

    const uploadSignedUrl = await createUploadSignedUrl({
      key: `${insertedFile._id}${extension}`,
      contentType: req.body.contentType,
    });
    res.json({ uploadSignedUrl, fileId: insertedFile._id });
  } catch (err) {
    console.log(err);
    next(err);
  }
};

export const uploadComplete = async (req, res, next) => {
  const file = await File.findById(req.body.fileId);
  if (!file) {
    return res.status(404).json({ error: "File not found in our records" });
  }

  try {
    const fileData = await getS3FileMetaData(`${file.id}${file.extension}`);
    if (fileData.ContentLength !== file.size) {
      await file.deleteOne();
      return res.status(400).json({ error: "File size does not match." });
    }
    file.isUploading = false;
    await file.save();
    await updateDirectoriesSize(file.parentDirId, file.size);
    res.json({ message: "Upload completed" });
  } catch (err) {
    await file.deleteOne();
    return res
      .status(404)
      .json({ error: "File was could not be uploaded properly." });
  }
};
