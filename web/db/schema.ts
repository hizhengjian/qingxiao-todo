import {integer,sqliteTable,text} from "drizzle-orm/sqlite-core";
export const records=sqliteTable("records",{id:text("id").primaryKey(),kind:text("kind").notNull(),payload:text("payload").notNull(),rev:integer("rev").notNull().default(1),lastOp:text("last_op").notNull(),updatedAt:integer("updated_at").notNull()});
export const receipts=sqliteTable("receipts",{opId:text("op_id").primaryKey(),recordId:text("record_id").notNull(),accepted:integer("accepted").notNull(),rev:integer("rev").notNull(),createdAt:integer("created_at").notNull()});
