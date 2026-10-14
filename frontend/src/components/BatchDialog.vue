<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import {
  api,
  ApiError,
  UnconfirmedError,
  statusLabels,
  type BatchResponse,
  type Operator,
  type Submission,
} from "../api/client";
import {
  fillEmptyReasons,
  issueFor,
  makeDrafts,
  setUnset,
  type Draft,
} from "./batch";

const props = defineProps<{
  modelValue: boolean;
  submissions: Submission[];
  operator: Operator | null;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  detail: [id: number];
  completed: [result: BatchResponse];
  busy: [value: boolean];
  reconciled: [];
}>();
const drafts = ref<Draft[]>([]);
const commonReason = ref("");
const busy = ref(false);
const checking = ref(false);
const uncertain = ref(false);
const checked = ref(false);
const errorMessage = ref("");
const fields = ref<{ path: string; message: string }[]>([]);
const active = computed(() => drafts.value.filter((item) => !item.blocked));
const approved = computed(
  () => active.value.filter((item) => item.decision === "approve").length,
);
const rejected = computed(
  () => active.value.filter((item) => item.decision === "reject").length,
);
const incomplete = computed(
  () => active.value.filter((item) => issueFor(item)).length,
);
const dirty = computed(() =>
  active.value.some((item) => item.decision || item.reason.trim()),
);
const canSubmit = computed(
  () =>
    !!props.operator &&
    active.value.length > 0 &&
    !incomplete.value &&
    !busy.value &&
    !checking.value &&
    !uncertain.value,
);
const locked = computed(() => busy.value || checking.value || uncertain.value);

function validationLabel(path: string) {
  const match = /^items\.(\d+)/.exec(path);
  if (match) {
    const index = Number(match[1]);
    const item = active.value[index];
    return item
      ? `第 ${index + 1} 条投稿（#${item.id}）`
      : `第 ${index + 1} 条投稿`;
  }
  return path === "operatorId" ? "审核员" : "本次审核";
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      drafts.value = makeDrafts(props.submissions);
      commonReason.value = "";
      errorMessage.value = "";
      fields.value = [];
      uncertain.value = false;
      checked.value = false;
    }
  },
);

async function close(done?: () => void) {
  if (busy.value || checking.value) return;
  if (dirty.value || uncertain.value) {
    try {
      await ElMessageBox.confirm(
        uncertain.value
          ? "本次处理结果尚未确认。关闭后仍需在列表核对最新状态。"
          : "关闭后会放弃本次填写的决策和原因，是否继续？",
        "关闭审核窗口",
        {
          confirmButtonText: "关闭窗口",
          cancelButtonText: "继续编辑",
          type: "warning",
        },
      );
    } catch {
      return;
    }
  }
  if (done) done();
  else emit("update:modelValue", false);
}

async function submit() {
  if (!canSubmit.value || !props.operator) return;
  const operatorId = props.operator.id;
  busy.value = true;
  emit("busy", true);
  errorMessage.value = "";
  fields.value = [];
  try {
    const result = await api.review({
      operatorId,
      items: active.value.map((item) => ({
        submissionId: item.id,
        expectedRevision: item.revision,
        decision: item.decision as "approve" | "reject",
        ...(item.decision === "reject" ? { reason: item.reason.trim() } : {}),
      })),
    });
    emit("update:modelValue", false);
    emit("completed", result);
  } catch (cause) {
    if (
      cause instanceof ApiError &&
      [
        "VALIDATION_ERROR",
        "INVALID_BODY",
        "DATABASE_BUSY",
        "INTERNAL_ERROR",
      ].includes(cause.code)
    ) {
      errorMessage.value = cause.message;
      fields.value = cause.details;
    } else {
      uncertain.value = true;
      checked.value = false;
      errorMessage.value =
        cause instanceof UnconfirmedError
          ? "处理结果尚未确认，请先核对当前状态，再决定是否重试。"
          : "未收到可确认的处理结果，请先核对当前状态。";
    }
  } finally {
    busy.value = false;
    emit("busy", false);
  }
}

async function checkStatuses() {
  checking.value = true;
  emit("busy", true);
  errorMessage.value = "";
  const responses = await Promise.allSettled(
    drafts.value.map((item) => api.detail(item.id)),
  );
  let unresolved = 0;
  responses.forEach((response, index) => {
    const item = drafts.value[index];
    if (response.status === "fulfilled") {
      item.status = response.value.status;
      item.revision = response.value.revision;
      item.blocked =
        response.value.status === "pending" ? undefined : "reviewed";
    } else if (
      response.reason instanceof ApiError &&
      response.reason.status === 404
    )
      item.blocked = "missing";
    else unresolved++;
  });
  uncertain.value = unresolved > 0;
  checked.value = unresolved === 0;
  if (unresolved)
    errorMessage.value = `还有 ${unresolved} 条未能核对，请恢复连接后再次核对。`;
  else emit("reconciled");
  checking.value = false;
  emit("busy", false);
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="设置审核决策"
    width="min(1080px, 96vw)"
    class="batch-dialog"
    :close-on-click-modal="false"
    :close-on-press-escape="!busy && !checking"
    :show-close="!busy && !checking"
    :before-close="close"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="batch-intro">
      <span>每条独立判断，全部填写完整后一次提交。</span
      ><span
        >审核员：<strong>{{ operator?.name ?? "未选择" }}</strong></span
      >
    </div>
    <div class="batch-tools">
      <el-button :disabled="locked" @click="setUnset(drafts, 'approve')"
        >未设置项全部通过</el-button
      >
      <el-button :disabled="locked" @click="setUnset(drafts, 'reject')"
        >未设置项全部驳回</el-button
      >
      <div class="common-reason">
        <el-input
          v-model="commonReason"
          :disabled="locked"
          maxlength="1000"
          aria-label="公共驳回原因"
          placeholder="公共原因，仅填充空白原因"
        /><el-button
          :disabled="locked || !commonReason.trim()"
          @click="fillEmptyReasons(drafts, commonReason)"
          >填充原因</el-button
        >
      </div>
    </div>
    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      :type="uncertain ? 'warning' : 'error'"
      :closable="false"
      show-icon
    />
    <ul v-if="fields.length" class="validation-errors">
      <li v-for="field in fields" :key="field.path">
        {{ validationLabel(field.path) }}：{{ field.message }}
      </li>
    </ul>
    <el-alert
      v-if="checked"
      type="info"
      :closable="false"
      :title="`已核对最新状态：仍有 ${active.length} 条待审核。已处理的条目可能来自本次请求或其他操作人，不会再次提交。`"
    />
    <div class="draft-list">
      <div
        v-for="(item, index) in drafts"
        :key="item.id"
        :class="['draft-row', { 'draft-blocked': item.blocked }]"
        :data-submission-id="item.id"
      >
        <div class="draft-title">
          <small
            >{{ String(index + 1).padStart(2, "0") }} / 投稿 #{{
              item.id
            }}</small
          ><strong>{{ item.title }}</strong
          ><el-button link type="primary" @click="emit('detail', item.id)"
            >查看全文</el-button
          >
        </div>
        <div v-if="item.blocked" class="draft-blocked-message">
          {{
            item.blocked === "missing"
              ? "投稿不存在，不再提交"
              : `当前${statusLabels[item.status]}，不再提交`
          }}
        </div>
        <template v-else>
          <div class="draft-decision">
            <label :for="`decision-${item.id}`">审核决策</label
            ><el-select
              :id="`decision-${item.id}`"
              v-model="item.decision"
              :disabled="locked"
              placeholder="请选择决策"
              :aria-label="`投稿 ${item.id} 的审核决策`"
              ><el-option label="通过" value="approve" /><el-option
                label="驳回"
                value="reject"
            /></el-select>
          </div>
          <div class="draft-reason">
            <label :for="`reason-${item.id}`">{{
              item.decision === "reject" ? "驳回原因（必填）" : "驳回原因"
            }}</label
            ><el-input
              :id="`reason-${item.id}`"
              v-model="item.reason"
              type="textarea"
              :rows="2"
              :disabled="locked || item.decision !== 'reject'"
              maxlength="1000"
              :aria-label="`投稿 ${item.id} 的驳回原因`"
              :placeholder="
                item.decision === 'reject'
                  ? '写明这条投稿为什么被驳回'
                  : '选择驳回后填写'
              "
            /><small v-if="issueFor(item)" class="field-hint">{{
              issueFor(item)
            }}</small>
          </div>
        </template>
      </div>
    </div>
    <template #footer>
      <div class="batch-footer">
        <div>
          <strong>本次 {{ active.length }} 条</strong
          ><span>通过 {{ approved }} · 驳回 {{ rejected }}</span
          ><small v-if="incomplete">还有 {{ incomplete }} 条未填写完整</small>
        </div>
        <div class="footer-actions">
          <el-button :disabled="busy || checking" @click="close()"
            >取消</el-button
          ><el-button
            v-if="uncertain"
            type="warning"
            :loading="checking"
            @click="checkStatuses"
            >核对当前状态</el-button
          ><el-button
            v-else-if="checked && !active.length"
            type="primary"
            @click="close()"
            >返回列表</el-button
          ><el-button
            v-else
            type="primary"
            :disabled="!canSubmit"
            :loading="busy"
            @click="submit"
            >{{
              checked
                ? `提交剩余 ${active.length} 条`
                : `提交 ${active.length} 条决策`
            }}</el-button
          >
        </div>
      </div>
    </template>
  </el-dialog>
</template>
