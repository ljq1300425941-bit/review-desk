<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import {
  api,
  ApiError,
  formatTime,
  statusLabels,
  type Detail,
  type Operator,
} from "../api/client";
import SubmissionMedia from "./SubmissionMedia.vue";

const props = defineProps<{
  modelValue: boolean;
  submissionId: number | null;
  allowReview: boolean;
  allowWithdraw: boolean;
  operator: Operator | null;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  review: [detail: Detail];
  withdrawn: [];
  busy: [value: boolean];
}>();
const detail = ref<Detail | null>(null);
const loading = ref(false);
const error = ref("");
const withdrawing = ref(false);
const uncertain = ref(false);
const withdrawalNotice = ref("");
const canWithdraw = computed(
  () =>
    props.allowWithdraw &&
    !!detail.value &&
    detail.value.status !== "pending" &&
    detail.value.reviewedBy === props.operator?.id,
);
let sequence = 0;
async function load() {
  if (!props.modelValue || props.submissionId === null) return;
  const current = ++sequence;
  loading.value = true;
  detail.value = null;
  error.value = "";
  try {
    const data = await api.detail(props.submissionId);
    if (current === sequence) {
      detail.value = data;
      return true;
    }
  } catch (cause) {
    if (current === sequence)
      error.value =
        cause instanceof ApiError
          ? cause.message
          : "详情加载失败，请检查连接后重试";
  } finally {
    if (current === sequence) loading.value = false;
  }
  return false;
}

async function withdraw() {
  if (
    !canWithdraw.value ||
    withdrawing.value ||
    uncertain.value ||
    !detail.value ||
    !props.operator
  )
    return;
  const snapshot = {
    id: detail.value.id,
    revision: detail.value.revision,
    status: detail.value.status,
    title: detail.value.title,
    operatorId: props.operator.id,
  };
  withdrawing.value = true;
  emit("busy", true);
  try {
    try {
      await ElMessageBox.confirm(
        `确认撤回《${snapshot.title}》的“${statusLabels[snapshot.status]}”结果？投稿将退回待审核，原审核记录仍然保留。`,
        "撤回审核",
        {
          confirmButtonText: "确认撤回",
          cancelButtonText: "保留原结果",
          type: "warning",
        },
      );
    } catch {
      return;
    }
    withdrawalNotice.value = "";
    try {
      const result = await api.withdraw(snapshot.id, {
        operatorId: snapshot.operatorId,
        expectedRevision: snapshot.revision,
      });
      withdrawalNotice.value = result.message;
      emit("withdrawn");
      await load();
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [
          "VALIDATION_ERROR",
          "INVALID_BODY",
          "DATABASE_BUSY",
          "INTERNAL_ERROR",
          "WITHDRAW_FORBIDDEN",
          "REVIEW_CONFLICT",
          "NOT_FOUND",
        ].includes(cause.code)
      ) {
        withdrawalNotice.value = cause.message;
        await load();
        emit("withdrawn");
      } else {
        uncertain.value = true;
        withdrawalNotice.value =
          "撤回结果尚未确认，请先核对当前状态，不要直接重复撤回。";
      }
    }
  } finally {
    withdrawing.value = false;
    emit("busy", false);
  }
}

async function checkWithdrawal() {
  if (withdrawing.value) return;
  withdrawing.value = true;
  emit("busy", true);
  try {
    if (await load()) {
      uncertain.value = false;
      withdrawalNotice.value = `已核对：投稿当前${statusLabels[detail.value!.status]}。请查看最新审核记录后再操作。`;
      emit("withdrawn");
    }
  } finally {
    withdrawing.value = false;
    emit("busy", false);
  }
}

async function closeDrawer(done: () => void) {
  if (withdrawing.value) return;
  if (uncertain.value) {
    try {
      await ElMessageBox.confirm(
        "撤回结果尚未确认。关闭后仍需核对最新状态，是否关闭？",
        "结果未确认",
        {
          confirmButtonText: "仍然关闭",
          cancelButtonText: "返回核对",
          type: "warning",
        },
      );
    } catch {
      return;
    }
  }
  done();
}
watch(
  () => [props.modelValue, props.submissionId],
  () => {
    if (props.modelValue) {
      uncertain.value = false;
      withdrawalNotice.value = "";
      void load();
    } else sequence++;
  },
);
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="投稿详情"
    size="min(640px, 100vw)"
    :show-close="!withdrawing"
    :close-on-click-modal="!withdrawing"
    :close-on-press-escape="!withdrawing"
    :before-close="closeDrawer"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-loading="loading" class="detail-content">
      <el-alert
        v-if="withdrawalNotice"
        :title="withdrawalNotice"
        :type="uncertain ? 'warning' : 'info'"
        :closable="false"
      />
      <el-button
        v-if="uncertain"
        :loading="withdrawing"
        @click="checkWithdrawal"
        >核对当前状态</el-button
      >
      <div v-if="error" class="error-area" role="alert">
        <el-alert :title="error" type="error" :closable="false" /><el-button
          @click="load"
          >重新加载</el-button
        >
      </div>
      <template v-if="detail">
        <span :class="['status-pill', detail.status]">{{
          statusLabels[detail.status]
        }}</span>
        <h2>{{ detail.title }}</h2>
        <p class="detail-meta">
          {{ detail.authorName }} · 投稿 #{{ detail.id }} ·
          {{ formatTime(detail.createdAt) }}
        </p>
        <article class="submission-body">{{ detail.body }}</article>
        <SubmissionMedia :attachments="detail.attachments" />
        <div
          v-if="allowReview && detail.status === 'pending'"
          class="detail-action"
        >
          <el-button type="primary" @click="emit('review', detail)"
            >设置这条投稿的决策</el-button
          >
        </div>
        <div v-if="canWithdraw" class="detail-action">
          <el-button
            type="warning"
            :disabled="withdrawing || uncertain"
            :loading="withdrawing"
            @click="withdraw"
            >撤回审核</el-button
          >
          <p class="muted">
            仅原处理人可撤回本次结果，退回待审核后可重新处理。
          </p>
        </div>
        <p
          v-else-if="allowWithdraw && detail.status !== 'pending'"
          class="muted"
        >
          该结果由{{ detail.reviewerName }}处理，仅原处理人可以撤回。
        </p>
        <section class="review-history">
          <h3>审核记录</h3>
          <p v-if="!detail.logs.length" class="muted">
            尚未审核，等待操作人设置决策。
          </p>
          <div v-for="log in detail.logs" :key="log.id" class="history-entry">
            <div>
              <strong>{{ log.operatorName }}</strong
              ><span :class="['status-pill', log.toStatus]">{{
                log.action === "withdraw"
                  ? "撤回审核"
                  : statusLabels[log.toStatus]
              }}</span>
            </div>
            <p v-if="log.reason">驳回原因：{{ log.reason }}</p>
            <p v-if="log.action === 'withdraw'">
              {{ statusLabels[log.fromStatus] }} → 待审核
            </p>
            <small
              >{{ formatTime(log.createdAt) }} · 批次 {{ log.batchId }}</small
            >
          </div>
        </section>
      </template>
    </div>
  </el-drawer>
</template>
