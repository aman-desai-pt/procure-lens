export const baseDir = import.meta.dev ? './.data' : '/var/lib/procure-lens'

export const BLOB_STORAGE_KEY = 'blobStorage';
export const blobStorage = useStorage(BLOB_STORAGE_KEY);
