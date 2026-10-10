import { Router, type IRouter } from "express";
import healthRouter from "./health";
import auditionRouter from "./audition-api";

const router: IRouter = Router();

router.use(healthRouter);
router.use(auditionRouter);

export default router;
