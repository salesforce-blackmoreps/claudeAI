import "reflect-metadata";
import type { IncomingMessage } from "node:http";
import { json } from "express";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { WsAdapter } from "@nestjs/platform-ws";
import { AppModule } from "./app.module";

async function bootstrap() {
  // bodyParser: false + a manual express.json() with `verify` below, so we
  // can capture the exact raw bytes of the request body (req.rawBody) for
  // Stripe webhook signature verification (billing.controller.ts) while
  // every other route still gets the normal parsed req.body Nest expects.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(
    json({
      verify: (req: IncomingMessage & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useWebSocketAdapter(new WsAdapter(app));
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

bootstrap();
