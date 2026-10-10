import { Router, type IRouter } from "express";
import healthRouter from "./health";
import auditionRouter from "./audition-api";
import adminHealthRouter from "./admin-health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(auditionRouter);
router.use(adminHealthRouter);

export default router;
