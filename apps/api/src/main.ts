import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

type ExpressMiddleware = (req: unknown, res: unknown, next: (error?: unknown) => void) => void;
const expressBodyParser = require("express") as {
  json: (options: { limit: string }) => ExpressMiddleware;
  urlencoded: (options: { extended: boolean; limit: string }) => ExpressMiddleware;
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.use(expressBodyParser.json({ limit: "10mb" }));
  app.use(expressBodyParser.urlencoded({ extended: true, limit: "10mb" }));
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);

  console.log(`API listening on http://localhost:${port}/api/health`);
}

void bootstrap();
