import { defineConfig } from "prisma/config";

const defaultDatabaseUrl =
  "postgresql://creativeos:creativeos@127.0.0.1:5432/creativeos?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DATABASE_URL"] || defaultDatabaseUrl,
  },
});
