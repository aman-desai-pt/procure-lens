<!-- MarkdownRenderer.vue -->
<template>
    <div v-html="renderedMarkdown" class="markdown-content"></div>
  </template>
  
  <script setup lang="ts">
  import { computed } from 'vue'
  import { marked } from 'marked'
  
  const props = defineProps<{
    content: string
  }>()
  
  const renderedMarkdown = computed(() => {
    return marked(props.content)
  })
  </script>
  
  <style scoped>
  .markdown-content {
    /* Add some basic markdown styling */
    h1 { font-size: 1.5em; font-weight: bold; }
    h2 { font-size: 1.3em; font-weight: bold; }
    h3 { font-size: 1.2em; font-weight: bold; }
    p { margin-bottom: 1em; }
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
    ul, ol { 
      margin-left: 1.5em; 
      margin-bottom: 1em; 
    }
  }
  </style>