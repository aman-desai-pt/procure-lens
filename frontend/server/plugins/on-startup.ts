import fsLite from 'unstorage/drivers/fs';
import vercelBlob from 'unstorage/drivers/vercel-blob';

export default defineNitroPlugin(async () => {
  const storage = useStorage();
  console.log('Mounting files on', baseDir);
  if (false) {
    const driver = fsLite({
      base: baseDir,
    });
    console.log(`Mounting fs driver.`);
    storage.mount(BLOB_STORAGE_KEY, driver);
  } else {
    const driver = vercelBlob({
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    console.log(`Mounting vercel driver`);
    storage.mount(BLOB_STORAGE_KEY, driver);
  }
});
