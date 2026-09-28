import { FastifyPluginAsync } from "fastify";
import * as inventoryController from "../controllers/inventory";
import { authMiddleware } from "@ecommerce/shared";

const inventoryRoutes: FastifyPluginAsync = async (fastify, opts) => {
  fastify.get("/:productId", inventoryController.getStock);
  fastify.post(
    "/:productId",
    { preHandler: [authMiddleware as any] },
    inventoryController.setStock,
  );
  fastify.post(
    "/:productId/reserve",
    { preHandler: [authMiddleware as any] },
    inventoryController.reserveStock,
  );
};

export default inventoryRoutes;
