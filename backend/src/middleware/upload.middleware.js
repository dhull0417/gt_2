// multer is a middleware for handling multipart/form-data, which is primarily used for file uploads

import multer from "multer";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (file.mimeType.startsWith("image/")) {
        cb(null,true); //now callback error so allow to progress
    } else {
        cb(new Error( "Only image files are allowed"), false); // callback error raised and progression halted
    }
};


const upload = multer({
    storage: storage,
    fileFilter:fileFilter,
    limits: {fileSize: 5* 1024*1024} //5MB limit
});

export default upload;