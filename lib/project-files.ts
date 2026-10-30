// Kinds of document kept on a project, and the file types accepted (by extension -> the content type used for the upload).
export const PROJECT_FILE_KINDS = ["Original bid", "Quote", "Contract", "Change order", "Other"];

export const PROJECT_FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export const MAX_PROJECT_FILE_MB = 100;
