const getParseServerUrl = () => {
  const parseServerUrl = process.env.PARSE_PUBLIC_SERVER_URL || process.env.PARSE_SERVER_URL;
  if (!parseServerUrl) {
    throw new Error("PARSE_PUBLIC_SERVER_URL or PARSE_SERVER_URL must be configured.");
  }

  return parseServerUrl.replace(/\/$/, "");
};

const deleteFileFromStorage = async (fileName) => {
  const serverUrl = getParseServerUrl();

  await Parse.Cloud.httpRequest({
    method: "DELETE",
    url: `${serverUrl}/files/${encodeURIComponent(fileName)}`,
    headers: {
      "X-Parse-Application-Id": process.env.PARSE_SERVER_APPLICATION_ID,
      "X-Parse-Master-Key": process.env.PARSE_SERVER_MASTER_KEY,
    },
  });
};

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

    for (const fileObject of fileResults) {
      const fileName = fileObject.get("name");

      if (!fileName) {
        continue;
      }

      try {
        await deleteFileFromStorage(fileName);
      } catch (error) {
        const statusCode = error?.status || error?.response?.status;
        if (statusCode !== 404) {
          throw new Error(`Failed to delete file from storage "${fileName}": ${error.message}`);
        }
      }
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
