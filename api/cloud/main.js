Parse.Cloud.define("deleteAll", async (request) => {
  const className = request.params.className;

  if (!className || typeof className !== "string") {
    throw new Error('Parameter "className" is required and must be a string.');
  }

  // Ensure the user is authenticated
  if (!request.user) {
    throw new Error("Authentication required.");
  }

  try {
    // Count objects before purging
    const query = new Parse.Query(className);
    const count = await query.count({ useMasterKey: true });

    // Purge class
    const schema = new Parse.Schema(className);
    await schema.purge({ useMasterKey: true });

    // Return JSON with deleted object count
    return {
      className,
      deletedObjects: count,
      status: "success",
    };
  } catch (error) {
    throw new Error(`Failed to purge class "${className}": ${error.message}`);
  }
});

Parse.Cloud.define("deleteFileStoreBeforeDate", async (request) => {
  const beforeDate = request.params.beforeDate;
  const className = request.params.className || "FileStore";
  const fileStorePath = process.env.FILE_STORE_PATH || "/parse/files";

  if (!beforeDate || typeof beforeDate !== "string") {
    throw new Error('Parameter "beforeDate" is required and must be a string.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) {
    throw new Error('Parameter "beforeDate" must be in YYYY-MM-DD format.');
  }

  if (!request.user) {
    throw new Error("Authentication required.");
  }

  const parsedDate = new Date(`${beforeDate}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('Parameter "beforeDate" is invalid.');
  }

  const fs = require("fs");
  const { promisify } = require("util");
  const { execFile } = require("child_process");
  const execFileAsync = promisify(execFile);

  if (!fs.existsSync(fileStorePath)) {
    throw new Error(
      `File store path "${fileStorePath}" does not exist on the server.`
    );
  }

  let deletedRecords = 0;
  const query = new Parse.Query(className);
  query.lessThan("createdAt", parsedDate);
  query.limit(1000);

  while (true) {
    const results = await query.find({ useMasterKey: true });
    if (!results.length) {
      break;
    }
    await Parse.Object.destroyAll(results, { useMasterKey: true });
    deletedRecords += results.length;
  }

  let deletedFiles = 0;
  try {
    const { stdout } = await execFileAsync("find", [
      fileStorePath,
      "-type",
      "f",
      "!",
      "-newermt",
      beforeDate,
      "-print",
      "-delete",
    ]);
    deletedFiles = stdout ? stdout.split("\n").filter(Boolean).length : 0;
  } catch (error) {
    throw new Error(`Failed to delete files: ${error.message}`);
  }

  return {
    status: "success",
    deletedRecords,
    deletedFiles,
    fileStorePath,
    beforeDate,
  };
});
