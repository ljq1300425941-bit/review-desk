<script setup lang="ts">
import { ref, watch } from "vue";
import {
  api,
  ApiError,
  formatTime,
  statusLabels,
  type Detail,
} from "../api/client";
import SubmissionMedia from "./SubmissionMedia.vue";

const props = defineProps<{
  modelValue: boolean;
  submissionId: number | null;
  allowReview: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  review: [detail: Detail];
}>();
const detail = ref<Detail | null>(null);
const loading = ref(false);
const error = ref("");
let sequence = 0;
async function load() {
  if (!props.modelValue || props.submissionId === null) return;
  const current = ++sequence;
  loading.value = true;
  detail.value = null;
  error.value = "";
  try {
    const data = await api.detail(props.submissionId);
    if (current === sequence) detail.value = data;
  } catch (cause) {
    if (current === sequence)
      error.value =
        cause instanceof ApiError
          ? cause.message
          : "详情加载失败，请检查连接后重试";
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(
  () => [props.modelValue, props.submissionId],
  () => {
    if (props.modelValue) void load();
    else sequence++;
  },
);
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="投稿详情"
    size="min(640px, 100vw)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-loading="loading" class="detail-content">
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
        <section class="review-history">
          <h3>审核记录</h3>
          <p v-if="!detail.logs.length" class="muted">
            尚未审核，等待操作人设置决策。
          </p>
          <div v-for="log in detail.logs" :key="log.id" class="history-entry">
            <div>
              <strong>{{ log.operatorName }}</strong
              ><span :class="['status-pill', log.toStatus]">{{
                statusLabels[log.toStatus]
              }}</span>
            </div>
            <p v-if="log.reason">驳回原因：{{ log.reason }}</p>
            <small
              >{{ formatTime(log.createdAt) }} · 批次 {{ log.batchId }}</small
            >
          </div>
        </section>
      </template>
    </div>
  </el-drawer>
</template>
