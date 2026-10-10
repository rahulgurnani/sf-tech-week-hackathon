import { Router, type IRouter } from "express";
import healthRouter from "./health";
import auditionRouter from "./audition-api";
import adminHealthRouter from "./admin-health";
import candidateRoomRouter from "./candidate-room";
import reviewRouter from "./review";
import companyRouter from "./company";

const router: IRouter = Router();

router.use(healthRouter);
router.use(auditionRouter);
router.use(adminHealthRouter);
router.use(candidateRoomRouter);
router.use(reviewRouter);
router.use(companyRouter);

export default router;
