<script setup lang="ts">
import type { MediaAttachment } from "../api/client";
defineProps<{ attachments: MediaAttachment[] }>();
</script>

<template>
  <el-alert
    v-if="attachments.length"
    type="warning"
    :closable="false"
    title="此投稿包含媒体附件，当前版本尚未提供媒体预览，请勿仅凭文字判断媒体内容。"
  />
</template>
