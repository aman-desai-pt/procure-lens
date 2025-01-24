<template>
  <div v-html="renderedContent" class="markdown-content"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';

const props = defineProps<{
  content: string;
}>();

const renderedContent = computed(() => {
  try {
    const jsonData = JSON.parse(props.content);

    if (Array.isArray(jsonData)) {
      return formatJsonResponse(jsonData);
    }

    return marked(props.content);
  } catch (error) {
    return marked(props.content);
  }
});

const formatJsonResponse = (jsonData: any[]) => {
  return jsonData
    .map(
      (item, index) => `
    <div class="bg-base-100 shadow-lg rounded-lg p-4 mb-4">
      <h3 class="text-lg font-medium text-primary mb-2">${item.title || `Response ${index + 1}`}</h3>
      <p class="text-gray-700 mb-4"><strong>${item.summary || 'Quick Overview'} <br /></strong> ${
        item.summary || 'This item has no overview available.'
      }</p>
      <div class="text-gray-600">
        <p class="mb-2">${item.details || 'Additional context is unavailable at the moment.'}</p>
        
        <label for="my_modal_7" class="btn btn-xs btn-outline btn-primary mt-2">More Details</label>
        <input type="checkbox" id="my_modal_7" class="modal-toggle" />
        <div class="modal" role="dialog">
          <div class="modal-box">
        ${
                  item.detailedDescription
                    ? `<p class="italic text-md text-gray-500">Insight: ${item.detailedDescription}</p>`
                    : ''
                }
                ${item.reference ? `<p class="italic text-sm text-gray-400">Source: ${item.reference}</p>` : ''}
          </div>
          <label class="modal-backdrop" for="my_modal_7">Close</label>
        </div>
      </div>
    </div>
  `
    )
    .join('');
};
</script>

<style scoped>
.markdown-content {
  line-height: 1.6;
}

h1 {
  font-size: 1.5em;
  font-weight: bold;
}
h2 {
  font-size: 1.3em;
  font-weight: bold;
}
h3 {
  font-size: 1.2em;
  font-weight: bold;
}
p {
  margin-bottom: 1em;
}
code {
  background-color: #f4f4f4;
  padding: 0.2em 0.4em;
  border-radius: 3px;
}
pre {
  background-color: #f4f4f4;
  padding: 1em;
  border-radius: 5px;
  overflow-x: auto;
}
ul,
ol {
  margin-left: 1.5em;
  margin-bottom: 1em;
}
</style>
