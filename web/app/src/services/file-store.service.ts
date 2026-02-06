import { FileStoreRecord } from "@/models";
import Parse, { FILE_STORE_CLASS_NAME } from "@/parse";

type DeleteBeforeDateResponse = {
  status: "success";
  deletedRecords: number;
  deletedFiles: number;
  fileStorePath: string;
  beforeDate: string;
};

export class FileStoreService {
  static async fetchAllData(): Promise<FileStoreRecord[]> {
    const FileStore = Parse.Object.extend(FILE_STORE_CLASS_NAME);
    const records: Parse.Object[] = [];
    let hasMore = true;
    let skip = 0;
    const limit = 1000;

    while (hasMore) {
      const query = new Parse.Query(FileStore);
      query.limit(limit);
      query.skip(skip);
      query.ascending("createdAt");
      const results = await query.find();
      records.push(...results);

      if (results.length < limit) {
        hasMore = false;
      } else {
        skip += limit;
      }
    }

    return records.map((record) => {
      const json = record.toJSON() as Record<string, unknown>;
      const normalized: FileStoreRecord = {
        ...json,
        id: record.id || "",
        createdAt: record.createdAt?.toISOString() || "",
        updatedAt: record.updatedAt?.toISOString() || "",
      };
      delete (normalized as { objectId?: string }).objectId;
      return normalized;
    });
  }

  static async deleteRecordsBeforeDate(
    beforeDate: string
  ): Promise<DeleteBeforeDateResponse> {
    return Parse.Cloud.run("deleteFileStoreBeforeDate", {
      beforeDate,
    });
  }
}
