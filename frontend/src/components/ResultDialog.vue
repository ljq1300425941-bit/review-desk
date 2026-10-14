<script setup lang="ts">
import { statusLabels, type BatchResponse } from "../api/client";
defineProps<{ modelValue: boolean; result: BatchResponse | null }>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  detail: [id: number];
}>();
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="本次审核结果"
    width="min(760px, 94vw)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="result">
      <div class="result-summary" role="status">
        <strong>成功 {{ result.summary.success }} 条</strong
        ><span>已被处理 {{ result.summary.conflict }} 条</span
        ><span>不存在 {{ result.summary.notFound }} 条</span>
      </div>
      <p class="muted">每条结果已列出；冲突项保留已有审核结果。</p>
      <el-table :data="result.results" max-height="380">
        <el-table-column prop="submissionId" label="投稿 ID" width="100" />
        <el-table-column label="结果" width="120"
          ><template #default="{ row }"
            ><span
              :class="[
                'status-pill',
                row.outcome === 'success' ? row.status : 'conflict',
              ]"
              >{{
                row.outcome === "success"
                  ? statusLabels[row.status as keyof typeof statusLabels]
                  : row.outcome === "conflict"
                    ? "已被处理"
                    : "不存在"
              }}</span
            ></template
          ></el-table-column
        >
        <el-table-column prop="message" label="说明" min-width="220" />
        <el-table-column width="90"
          ><template #default="{ row }"
            ><el-button
              v-if="row.outcome !== 'not_found'"
              link
              type="primary"
              @click="emit('detail', row.submissionId)"
              >查看</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <p class="batch-reference">批次 {{ result.batchId }}</p>
    </template>
    <template #footer
      ><el-button type="primary" @click="emit('update:modelValue', false)"
        >返回列表</el-button
      ></template
    >
  </el-dialog>
</template>
