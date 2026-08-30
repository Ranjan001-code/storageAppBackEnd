import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

const privateKey = process.env.CLOUDFRONT_PRIVATE_KEY;
const keyPairId = "KJA76U165W5OV"; // Replace with your CloudFront key pair ID
const distributionName = `https://d1jooua0d0khxz.cloudfront.net`;

export const createCloudFrontGetSignedUrl = ({
  key,
  download = false,
  filename,
}) => {
  const dateLessThan = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  const url = `${distributionName}/${key}?response-content-disposition=${encodeURIComponent(`${download ? "attachment" : "inline"}; filename=${filename}`)}`;
  // console.log("CloudFront URL:", url);
  const signedUrl = getSignedUrl({
    url,
    keyPairId,
    dateLessThan,
    privateKey,
  });
  // console.log("Signed URL:", signedUrl);
  return signedUrl;
};

// https://bibwild.wordpress.com/2024/06/18/cloudfront-in-front-of-s3-using-response-content-disposition/
