import { randomUUID } from 'uncrypto';

export default defineEventHandler(async (event) => {
  const body = await readMultipartFormData(event);
  if (!body || body.length == 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing file from request',
    });
  }
  const assetIds = await Promise.all(
    body.map(async (file) => {
      const asset = Buffer.from(file.data.buffer);
      const assetId = randomUUID();
      await blobStorage.setItemRaw(`${assetId}.pdf`, asset);
      return assetId;
    })
  );

  return assetIds;
});
