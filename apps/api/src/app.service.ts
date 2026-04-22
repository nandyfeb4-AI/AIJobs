import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  health() {
    return {
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString(),
    };
  }
}

