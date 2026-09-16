import { BaseRepository } from "./baseRepository";

export interface ProgramEntity {
  id: string;
  title: string;
  category: string;
  amountRequired: number;
  amountCollected: number;
  progress: number;
  status: string;
  description: string;
  createdAt: string;
}

const PROGRAM_HEADERS = [
  "id",
  "title",
  "category",
  "amountRequired",
  "amountCollected",
  "progress",
  "status",
  "description",
  "createdAt",
];

export class ProgramRepository extends BaseRepository<ProgramEntity> {
  constructor() {
    super("Programs", PROGRAM_HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): ProgramEntity {
    return {
      id: String(row.id || ""),
      title: String(row.title || ""),
      category: String(row.category || ""),
      amountRequired: Number(row.amountRequired || 0),
      amountCollected: Number(row.amountCollected || 0),
      progress: Number(row.progress || 0),
      status: String(row.status || "active"),
      description: String(row.description || ""),
      createdAt: String(row.createdAt || new Date().toISOString()),
    };
  }

  protected mapEntityToRow(program: ProgramEntity): Record<string, any> {
    return {
      id: program.id,
      title: program.title,
      category: program.category,
      amountRequired: program.amountRequired,
      amountCollected: program.amountCollected,
      progress: program.progress,
      status: program.status,
      description: program.description,
      createdAt: program.createdAt,
    };
  }
}

export const programRepository = new ProgramRepository();
