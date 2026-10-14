import type Database from "better-sqlite3";
import { operators } from "../config/operators.js";

const samples = [
  [
    "周末沿江骑行的小路线",
    "从防洪纪念塔出发，沿江一路向西。早晨的风比较凉，记得带一件薄外套。\n沿途注意行人，骑行时不要占用人行道。",
  ],
  [
    "低价代购，限时进群",
    "各种商品内部价格，扫码加群了解详情。联系方式：example-123。",
  ],
  ["图书馆自习的一天", "下午在图书馆读完了两章书。窗外下着小雨，馆内很安静。"],
  [
    "新手露营装备清单",
    "第一次露营可以从帐篷、防潮垫、睡袋开始。确认天气预报，并遵守营地管理规定。",
  ],
  [
    "写给第一次实习的自己",
    "认真记录问题、复现步骤和解决方法。主动确认交付标准，比只问能不能跑更有帮助。",
  ],
  [
    "三天成为编程高手",
    "完全不需要基础，付费后保证三天精通所有语言，包进大厂。",
  ],
  [
    "家常番茄鸡蛋面",
    "番茄炒出汁，加入热水和面条，最后放入鸡蛋。口味按自己的习惯调整。",
  ],
  [
    "一次迷路的城市散步",
    "走错了路，却发现一间很小的旧书店。店主正在给书架上的书擦灰。",
  ],
  [
    "重复发布的活动广告",
    "请大家转发我们的商业活动，详情请加群，转发可领取优惠券。",
  ],
  ["整理旧照片的晚上", "照片里的街道已经变了模样，但当时的阳光仍然明亮。"],
  [
    "我的 TypeScript 学习笔记",
    "类型检查帮助发现部分错误，但服务端仍需要校验外部输入。\n测试要关注真实行为，而不是重复实现代码。",
  ],
  [
    "不用走路的徒步攻略",
    "标题写徒步，正文只介绍电子游戏。这条演示内容用于体验独立填写驳回原因。",
  ],
  ["校园秋日记录", "落叶铺在路边，晚课结束后操场上还有人在跑步。"],
  ["做饭失败也值得记录", "盐放多了，面也煮软了。下次先少放一点，再尝味道。"],
  ["地铁里的读书时间", "每天通勤时读十页，不用急着追求读完的速度。"],
  [
    "键盘与快捷键",
    "先学会常用的查找、跳转和重命名，再慢慢建立自己的操作习惯。",
  ],
  ["雨后的一束光", "雨停以后，树叶上的水珠在阳光里闪了一下。"],
  [
    "一场失败的球赛",
    "输球之后我们重新看了录像，才发现配合的问题比个人失误更多。",
  ],
  ["猫咪观察日记", "窗台上的猫盯着楼下的树看了很久，最后自己睡着了。"],
  [
    "网页里显示特殊字符",
    '<script>alert("投稿不能执行脚本")</script>\n这里还有 <b>标签</b>、&、引号和普通文字，都应作为文本显示。',
  ],
  [
    "长文：一次完整的项目复盘",
    "我们先明确了用户如何完成任务，再把流程拆成几个可以验证的步骤。\n\n" +
      "每个步骤都记录输入、输出、失败方式和验收证据。代码能启动只是第一步，还需要确认真实操作的结果。\n".repeat(
        25,
      ),
  ],
  [
    "手工做一个书签",
    "找一张厚纸，写下最近喜欢的一句话。没有复杂的材料也可以开始。",
  ],
  ["城市里的夜跑", "选择照明良好的路线，穿反光衣物，身体不舒服时及时停止。"],
  ["作者名字也能被搜索", "这条投稿位于第二页，用来检查分页与当前页选择范围。"],
  ["已通过：社区读书活动", "活动向社区居民开放，欢迎分享自己最近读过的书。"],
  ["已通过：公园漫步", "傍晚在公园散步，遇到了一位正在画树的老人。"],
  ["已通过：学习小组记录", "我们一起讨论了服务端校验和数据持久化的区别。"],
  ["已驳回：纯广告投稿", "购买服务请添加联系方式，本文为演示广告投稿。"],
  ["已驳回：标题与正文无关", "正文仅重复无关内容，没有提供标题承诺的信息。"],
  ["已驳回：重复内容", "与上一条投稿完全相同，本条用于展示已有的驳回记录。"],
];

export function seedDatabase(db: Database.Database) {
  const insert =
    db.prepare(`INSERT INTO submissions (id, title, body, author_name, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)`);
  samples.forEach(([title, body], index) => {
    insert.run(
      index + 1,
      title,
      body,
      ["小禾", "北岸", "纸飞机", "小林", "阿舟"][index % 5],
      new Date(Date.UTC(2026, 9, 12, 8, index * 13)).toISOString(),
    );
  });
  for (let id = 25; id <= 30; id++) {
    const approved = id <= 27;
    const status = approved ? "approved" : "rejected";
    const reason = approved
      ? null
      : ["包含商业广告", "标题与正文无关", "重复投稿"][id - 28];
    const operator = operators[(id - 25) % 2];
    const time = new Date(Date.UTC(2026, 9, 13, 10, id)).toISOString();
    db.prepare(
      `UPDATE submissions SET status = ?, reviewed_by = ?, reviewer_name = ?,
      reviewed_at = ?, rejection_reason = ? WHERE id = ?`,
    ).run(status, operator.id, operator.name, time, reason, id);
    db.prepare(
      `INSERT INTO review_logs (submission_id, batch_id, operator_id, operator_name,
      from_status, to_status, reason, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).run(id, "demo-history", operator.id, operator.name, status, reason, time);
  }
}
