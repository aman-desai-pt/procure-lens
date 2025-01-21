import fsLite from 'unstorage/drivers/fs';

export default defineNitroPlugin(async () => {
  const storage = useStorage();
  console.log('Mounting files on', baseDir);
  let driver = fsLite({
    base: baseDir,
  });
  console.log(`Mounting fs driver.`);
  storage.mount(BLOB_STORAGE_KEY, driver);
});
