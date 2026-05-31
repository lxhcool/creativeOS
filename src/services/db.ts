import Dexie, { type Table } from "dexie";
import type { UserModel, UserProvider, UserRoutingRule } from "@/types/provider";

class CreativeOSDatabase extends Dexie {
  userProviders!: Table<UserProvider, string>;
  userModels!: Table<UserModel, string>;
  userRouting!: Table<UserRoutingRule, string>;

  constructor() {
    super("CreativeOS");

    this.version(1).stores({
      userProviders: "id, type, enabled",
      userModels: "id, providerId",
      userRouting: "taskType",
    });
  }
}

export const db = new CreativeOSDatabase();

export async function saveProvider(provider: UserProvider): Promise<void> {
  await db.userProviders.put(provider);
}

export async function loadAllProviders(): Promise<UserProvider[]> {
  return db.userProviders.toArray();
}

export async function deleteProvider(id: string): Promise<void> {
  await db.userProviders.delete(id);
  await db.userModels.where("providerId").equals(id).delete();
}

export async function saveModel(model: UserModel): Promise<void> {
  await db.userModels.put(model);
}

export async function loadModelsForProvider(providerId: string): Promise<UserModel[]> {
  return db.userModels.where("providerId").equals(providerId).toArray();
}

export async function deleteModel(id: string): Promise<void> {
  await db.userModels.delete(id);
}

export async function saveRoutingRule(rule: UserRoutingRule): Promise<void> {
  await db.userRouting.put(rule);
}

export async function loadAllRoutingRules(): Promise<UserRoutingRule[]> {
  return db.userRouting.toArray();
}

export async function deleteRoutingRule(taskType: string): Promise<void> {
  await db.userRouting.delete(taskType);
}

export async function clearAllData(): Promise<void> {
  await db.userProviders.clear();
  await db.userModels.clear();
  await db.userRouting.clear();
}
