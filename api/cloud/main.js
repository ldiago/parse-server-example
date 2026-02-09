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
  const fileQuery = new Parse.Query("_File");
  fileQuery.lessThan("createdAt", parsedDate);
  fileQuery.limit(1000);

  while (true) {
    const fileResults = await fileQuery.find({ useMasterKey: true });
    if (!fileResults.length) {
      break;
    }
    await Parse.Object.destroyAll(fileResults, { useMasterKey: true });
    deletedFiles += fileResults.length;
  }

  return {
    status: "success",
    deletedRecords,
    deletedFiles,
    beforeDate,
  };
});
