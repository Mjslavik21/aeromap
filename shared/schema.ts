import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  location: text("location"),
  lat: text("lat"),
  lng: text("lng"),
  status: text("status").notNull().default("active"),
  imageCount: integer("image_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const uploads = sqliteTable("uploads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  type: text("type").notNull(), // "photo" | "video" | "panorama"
  lat: text("lat"),
  lng: text("lng"),
  altitude: text("altitude"),
  createdAt: text("created_at").notNull(),
});

export const processings = sqliteTable("processings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  status: text("status").notNull().default("queued"), // queued | aligning | densifying | meshing | texturing | complete | failed
  progress: integer("progress").notNull().default(0),
  outputType: text("output_type").notNull().default("3d_model"), // 3d_model | orthomosaic | point_cloud
  nodeodmUuid: text("nodeodm_uuid"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
});

export const insertUploadSchema = createInsertSchema(uploads).omit({
  id: true,
});

export const insertProcessingSchema = createInsertSchema(processings).omit({
  id: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertUpload = z.infer<typeof insertUploadSchema>;
export type Upload = typeof uploads.$inferSelect;
export type InsertProcessing = z.infer<typeof insertProcessingSchema>;
export type Processing = typeof processings.$inferSelect;
