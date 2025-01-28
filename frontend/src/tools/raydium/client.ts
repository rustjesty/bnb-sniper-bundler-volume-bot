// src/tools/raydium/client.ts

import { validateRaydiumConfig } from "./config/constants";


class RaydiumClient {
  private config;

  constructor() {
    this.config = validateRaydiumConfig();
  }

  async initialize() {
    // This will only use public config on client side
    return this.config;
  }

  // Add other client-side methods
}

export const raydiumClient = new RaydiumClient();