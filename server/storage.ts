import {
  type User, type InsertUser, users,
  type Project, type InsertProject, projects,
  type Upload, type InsertUpload, uploads,
  type Processing, type InsertProcessing, processings,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: number): Promise<void>;

  getUploadsByProject(projectId: number): Promise<Upload[]>;
  getUpload(id: number): Promise<Upload | undefined>;
  createUpload(upload: InsertUpload): Promise<Upload>;
  deleteUpload(id: number): Promise<void>;

  getProcessingsByProject(projectId: number): Promise<Processing[]>;
  getProcessing(id: number): Promise<Processing | undefined>;
  createProcessing(processing: InsertProcessing): Promise<Processing>;
  updateProcessing(id: number, data: Partial<InsertProcessing>): Promise<Processing | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return db.insert(users).values(insertUser).returning().get();
  }

  async getProjects(): Promise<Project[]> {
    return db.select().from(projects).orderBy(desc(projects.createdAt)).all();
  }

  async getProject(id: number): Promise<Project | undefined> {
    return db.select().from(projects).where(eq(projects.id, id)).get();
  }

  async createProject(project: InsertProject): Promise<Project> {
    return db.insert(projects).values(project).returning().get();
  }

  async updateProject(id: number, data: Partial<InsertProject>): Promise<Project | undefined> {
    const results = db.update(projects).set(data).where(eq(projects.id, id)).returning().all();
    return results[0];
  }

  async deleteProject(id: number): Promise<void> {
    db.delete(uploads).where(eq(uploads.projectId, id)).run();
    db.delete(processings).where(eq(processings.projectId, id)).run();
    db.delete(projects).where(eq(projects.id, id)).run();
  }

  async getUploadsByProject(projectId: number): Promise<Upload[]> {
    return db.select().from(uploads).where(eq(uploads.projectId, projectId)).orderBy(desc(uploads.createdAt)).all();
  }

  async getUpload(id: number): Promise<Upload | undefined> {
    return db.select().from(uploads).where(eq(uploads.id, id)).get();
  }

  async createUpload(upload: InsertUpload): Promise<Upload> {
    return db.insert(uploads).values(upload).returning().get();
  }

  async deleteUpload(id: number): Promise<void> {
    db.delete(uploads).where(eq(uploads.id, id)).run();
  }

  async getProcessingsByProject(projectId: number): Promise<Processing[]> {
    return db.select().from(processings).where(eq(processings.projectId, projectId)).orderBy(desc(processings.createdAt)).all();
  }

  async getProcessing(id: number): Promise<Processing | undefined> {
    return db.select().from(processings).where(eq(processings.id, id)).get();
  }

  async createProcessing(processing: InsertProcessing): Promise<Processing> {
    return db.insert(processings).values(processing).returning().get();
  }

  async updateProcessing(id: number, data: Partial<InsertProcessing>): Promise<Processing | undefined> {
    const results = db.update(processings).set(data).where(eq(processings.id, id)).returning().all();
    return results[0];
  }
}

export const storage = new DatabaseStorage();
