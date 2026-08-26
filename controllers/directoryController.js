import Directory from "../models/directoryModel.js";
import File from "../models/fileModel.js";
import { updateDirectoriesSize } from "./fileController.js";
import { deleteS3Files } from "../services/s3.js";

export async function getDirectoryStats(dirId) {
  const childFiles = await File.find({ parentDirId: dirId }).select("size").lean();
  let totalSize = childFiles.reduce((acc, f) => acc + (f.size || 0), 0);
  let fileCount = childFiles.length;

  const childDirs = await Directory.find({ parentDirId: dirId }).select("_id").lean();
  let folderCount = childDirs.length;

  for (const childDir of childDirs) {
    const subStats = await getDirectoryStats(childDir._id);
    totalSize += subStats.totalSize;
    fileCount += subStats.fileCount;
    folderCount += subStats.folderCount;
  }

  return { totalSize, fileCount, folderCount };
}

export const getDirectory = async (req, res) => {
  const user = req.user;
  const _id = req.params.id || user.rootDirId.toString();
  const query = req.user.role === "Admin" ? { _id } : { _id, userId: req.user._id };
  const directoryData = await Directory.findOne(query).lean();
  if (!directoryData) {
    return res
      .status(404)
      .json({ error: "Directory not found or you do not have access to it!" });
  }

  const files = await File.find({ parentDirId: directoryData._id }).lean();
  const rawDirectories = await Directory.find({ parentDirId: _id }).lean();

  const directories = await Promise.all(
    rawDirectories.map(async (dir) => {
      const stats = await getDirectoryStats(dir._id);
      if (dir.size !== stats.totalSize) {
        await Directory.updateOne({ _id: dir._id }, { size: stats.totalSize });
      }
      return {
        ...dir,
        id: dir._id,
        size: stats.totalSize,
        numberOfFiles: stats.fileCount,
        numberOfFolders: stats.folderCount,
      };
    })
  );

  const currentStats = await getDirectoryStats(directoryData._id);
  if (directoryData.size !== currentStats.totalSize) {
    await Directory.updateOne({ _id: directoryData._id }, { size: currentStats.totalSize });
  }

  return res.status(200).json({
    ...directoryData,
    size: currentStats.totalSize,
    numberOfFiles: currentStats.fileCount,
    numberOfFolders: currentStats.folderCount,
    files: files.map((f) => ({ ...f, id: f._id })),
    directories,
  });
};

export const createDirectory = async (req, res, next) => {
  const user = req.user;

  const parentDirId = req.params.parentDirId || user.rootDirId.toString();
  const dirname = req.headers.dirname || "New Folder";
  try {
    const parentDir = await Directory.findOne({
      _id: parentDirId,
    }).lean();

    if (!parentDir)
      return res
        .status(404)
        .json({ message: "Parent Directory Does not exist!" });

    await Directory.create({
      name: dirname,
      parentDirId,
      userId: parentDir.userId,
    });

    return res.status(201).json({ message: "Directory Created!" });
  } catch (err) {
    if (err.code === 121) {
      res
        .status(400)
        .json({ error: "Invalid input, please enter valid details" });
    } else {
      next(err);
    }
  }
};

export const renameDirectory = async (req, res, next) => {
  const user = req.user;
  const { id } = req.params;
  const { newDirName } = req.body;
  try {
    const query = user.role === "Admin" ? { _id: id } : { _id: id, userId: user._id };
    await Directory.findOneAndUpdate(
      query,
      { name: newDirName }
    );
    res.status(200).json({ message: "Directory Renamed!" });
  } catch (err) {
    next(err);
  }
};

export const deleteDirectory = async (req, res, next) => {
  const { id } = req.params;

  try {
    const query = req.user.role === "Admin" ? { _id: id } : { _id: id, userId: req.user._id };
    const directoryData = await Directory.findOne(query).lean();

    if (!directoryData) {
      return res.status(404).json({ error: "Directory not found!" });
    }

    async function getDirectoryContents(dirId) {
      let files = await File.find({ parentDirId: dirId })
        .select("extension size")
        .lean();
      let directories = await Directory.find({ parentDirId: dirId })
        .select("_id")
        .lean();

      for (const { _id } of directories) {
        const { files: childFiles, directories: childDirectories } =
          await getDirectoryContents(_id);

        files = [...files, ...childFiles];
        directories = [...directories, ...childDirectories];
      }

      return { files, directories };
    }

    const { files, directories } = await getDirectoryContents(id);
    const totalDeletedSize = files.reduce((acc, f) => acc + (f.size || 0), 0);

    const keys = files.map(({ _id, extension }) => ({
      Key: `${_id}${extension}`,
    }));

    console.log(keys);

    if (keys.length > 0) {
      const response = await deleteS3Files(keys);
      console.log(response);
    }

    await File.deleteMany({
      _id: { $in: files.map(({ _id }) => _id) },
    });

    await Directory.deleteMany({
      _id: { $in: [...directories.map(({ _id }) => _id), id] },
    });

    await updateDirectoriesSize(directoryData.parentDirId, -totalDeletedSize);
    return res.json({ message: "Files deleted successfully" });
  } catch (err) {
    next(err);
  }
};

