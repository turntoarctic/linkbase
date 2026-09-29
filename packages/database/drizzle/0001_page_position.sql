-- 08 §3.3：页内兄弟排序（拖拽换序/换父，T1.3）。双层精度中点插入，间隔耗尽时服务端整列重排
ALTER TABLE "pages" ADD COLUMN "position" double precision NOT NULL DEFAULT 0;
--> statement-breakpoint
-- 存量行按创建序铺底（间隔 1024），与新行（next-1 / prev+1 / 中点）语义兼容
UPDATE "pages" SET "position" = s.rn * 1024.0
FROM (SELECT "id", ROW_NUMBER() OVER (PARTITION BY "parent_id" ORDER BY "created_at") AS rn FROM "pages") AS s
WHERE "pages"."id" = s."id";
