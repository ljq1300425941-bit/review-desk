<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { TableInstance } from "element-plus";
import {
  api,
  formatTime,
  statusLabels,
  type BatchResponse,
  type Operator,
  type Status,
  type Submission,
} from "./api/client";
import BatchDialog from "./components/BatchDialog.vue";
import SubmissionDrawer from "./components/SubmissionDrawer.vue";
import ResultDialog from "./components/ResultDialog.vue";

const operators = ref<Operator[]>([]);
const operatorId = ref(
  localStorage.getItem("review-desk.operator") ?? "reviewer-a",
);
const operator = computed(
  () => operators.value.find((item) => item.id === operatorId.value) ?? null,
);
const operatorError = ref("");
const status = ref<Status | "all">("pending");
const searchText = ref("");
const q = ref("");
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const submissions = ref<Submission[]>([]);
const selected = ref<Submission[]>([]);
const table = ref<TableInstance>();
const loading = ref(false);
const error = ref("");
const batchOpen = ref(false);
const batchItems = ref<Submission[]>([]);
const batchBusy = ref(false);
const detailOpen = ref(false);
const detailId = ref<number | null>(null);
const resultOpen = ref(false);
const lastResult = ref<BatchResponse | null>(null);
let sequence = 0;

function clearSelection() {
  selected.value = [];
  table.value?.clearSelection();
}
async function load() {
  const current = ++sequence;
  clearSelection();
  loading.value = true;
  error.value = "";
  try {
    const data = await api.list({
      status: status.value,
      q: q.value,
      page: page.value,
      pageSize,
    });
    if (current !== sequence) return;
    if (
      page.value > 1 &&
      !data.items.length &&
      data.total <= (page.value - 1) * pageSize
    ) {
      page.value = Math.max(1, Math.ceil(data.total / pageSize));
      return;
    }
    submissions.value = data.items;
    total.value = data.total;
  } catch (cause) {
    if (current === sequence)
      error.value = cause instanceof Error ? cause.message : "列表加载失败";
  } finally {
    if (current === sequence) loading.value = false;
  }
}
async function loadOperators() {
  operatorError.value = "";
  try {
    operators.value = (await api.operators()).items;
    if (!operator.value) operatorId.value = operators.value[0]?.id ?? "";
  } catch {
    operatorError.value = "审核员加载失败，暂时无法提交，请重新加载。";
  }
}
function search() {
  const next = searchText.value.trim();
  if (q.value === next && page.value === 1) {
    void load();
    return;
  }
  q.value = next;
  page.value = 1;
}
function openDetail(id: number) {
  detailId.value = id;
  detailOpen.value = true;
}
function openBatch(items: Submission[]) {
  batchItems.value = items.map((item) => ({ ...item }));
  batchOpen.value = true;
}
function completed(result: BatchResponse) {
  lastResult.value = result;
  resultOpen.value = true;
  clearSelection();
  void load();
}
watch([status, q, page], () => void load());
watch(status, () => {
  if (page.value !== 1) page.value = 1;
});
watch(operatorId, (value) =>
  localStorage.setItem("review-desk.operator", value),
);
onMounted(() => {
  void load();
  void loadOperators();
});
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="/" aria-label="Review Desk 首页"
        ><svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
          <rect width="34" height="34" rx="9" fill="currentColor" />
          <path
            d="M10 10h14M10 16h8M10 22h5m4-1 3 3 5-7"
            fill="none"
            stroke="white"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          /></svg
        ><span>Review Desk<small>内容审核工作台</small></span></a
      >
      <div class="sidebar-nav"><span class="active-nav">投稿审核</span></div>
      <div class="sidebar-guide">
        <strong>每一次判断，都有记录</strong>
        <p>阅读完整内容<br />逐条设置决策<br />提交后核对结果</p>
      </div>
      <div class="sidebar-foot">让交接更清楚</div>
    </aside>
    <main class="workspace">
      <header class="workspace-header">
        <div>
          <h1>投稿审核</h1>
          <p>逐条判断，一次提交。先处理最早等待的投稿。</p>
        </div>
        <div class="operator-box">
          <label for="operator-select">当前审核员</label
          ><el-select
            id="operator-select"
            v-model="operatorId"
            aria-label="当前审核员"
            :disabled="batchOpen || batchBusy"
            style="width: 136px"
            ><el-option
              v-for="person in operators"
              :key="person.id"
              :label="person.name"
              :value="person.id" /></el-select
          ><small>演示身份</small>
        </div>
      </header>
      <div v-if="operatorError" class="error-area">
        <el-alert
          :title="operatorError"
          type="error"
          :closable="false"
        /><el-button @click="loadOperators">重新加载审核员</el-button>
      </div>
      <section class="review-panel" aria-label="投稿列表">
        <div class="filter-bar">
          <el-radio-group v-model="status" aria-label="筛选投稿状态"
            ><el-radio-button value="pending">待审核</el-radio-button
            ><el-radio-button value="approved">已通过</el-radio-button
            ><el-radio-button value="rejected">已驳回</el-radio-button
            ><el-radio-button value="all">全部</el-radio-button></el-radio-group
          >
          <div class="search-controls">
            <el-input
              v-model="searchText"
              clearable
              aria-label="搜索标题或作者"
              placeholder="搜索标题或作者"
              maxlength="200"
              @keyup.enter="search"
              @clear="search"
            /><el-button @click="search">搜索</el-button
            ><el-button :loading="loading" @click="load">刷新</el-button>
          </div>
        </div>
        <div class="selection-bar">
          <div>
            <strong>{{
              selected.length
                ? `已选择 ${selected.length} 条`
                : "选择需要审核的投稿"
            }}</strong
            ><span>全选仅选择本页待审核项</span>
          </div>
          <div class="selection-actions">
            <el-button v-if="lastResult" @click="resultOpen = true"
              >查看上次结果</el-button
            ><el-button
              type="primary"
              :disabled="!selected.length || !operator || !!error || loading"
              @click="openBatch(selected)"
              >设置审核决策</el-button
            >
          </div>
        </div>
        <div v-if="error" class="list-error" role="alert">
          <el-alert :title="error" type="error" :closable="false" /><el-button
            @click="load"
            >重试</el-button
          >
        </div>
        <div class="table-scroll">
          <el-table
            ref="table"
            v-loading="loading"
            :data="submissions"
            row-key="id"
            class="submission-table"
            @selection-change="selected = $event"
          >
            <el-table-column
              type="selection"
              width="54"
              :selectable="
                (row: Submission) => row.status === 'pending' && !error
              "
              :reserve-selection="false"
            />
            <el-table-column label="投稿内容" min-width="320"
              ><template #default="{ row }"
                ><button class="title-button" @click="openDetail(row.id)">
                  {{ row.title }}
                </button>
                <div class="row-subtitle">投稿 #{{ row.id }}</div></template
              ></el-table-column
            >
            <el-table-column prop="authorName" label="作者" width="120" />
            <el-table-column label="提交时间" width="155"
              ><template #default="{ row }">{{
                formatTime(row.createdAt)
              }}</template></el-table-column
            >
            <el-table-column label="状态" width="110"
              ><template #default="{ row }"
                ><span :class="['status-pill', row.status]">{{
                  statusLabels[row.status as Status]
                }}</span></template
              ></el-table-column
            >
            <el-table-column label="操作" width="100"
              ><template #default="{ row }"
                ><el-button link type="primary" @click="openDetail(row.id)"
                  >查看全文</el-button
                ></template
              ></el-table-column
            >
            <template #empty
              ><el-empty
                :description="loading ? '正在加载投稿' : '没有符合条件的投稿'"
                :image-size="72"
            /></template>
          </el-table>
        </div>
        <footer class="table-footer">
          <span>共 {{ total }} 条投稿 · 每页 {{ pageSize }} 条</span
          ><el-pagination
            v-model:current-page="page"
            :page-size="pageSize"
            :total="total"
            layout="prev, pager, next"
            :disabled="loading"
          />
        </footer>
      </section>
      <p class="workspace-note">
        已审核结果保留。遇到其他审核员先行处理的投稿，会逐条提示。
      </p>
    </main>
    <BatchDialog
      v-model="batchOpen"
      :submissions="batchItems"
      :operator="operator"
      @detail="openDetail"
      @completed="completed"
      @busy="batchBusy = $event"
      @reconciled="load"
    />
    <ResultDialog
      v-model="resultOpen"
      :result="lastResult"
      @detail="openDetail"
    />
    <SubmissionDrawer
      v-model="detailOpen"
      :submission-id="detailId"
      :allow-review="!batchOpen && !resultOpen && !!operator"
      @review="
        detailOpen = false;
        openBatch([$event]);
      "
    />
  </div>
</template>
