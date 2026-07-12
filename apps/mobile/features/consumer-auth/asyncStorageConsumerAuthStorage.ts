import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConsumerAuthStorage } from "./storage";

export class AsyncStorageConsumerAuthStorage implements ConsumerAuthStorage {
  async getItem(key: string): Promise<string | null> {
    return AsyncStorage.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  }
}

export function createAsyncStorageConsumerAuthStorage(): ConsumerAuthStorage {
  return new AsyncStorageConsumerAuthStorage();
}
