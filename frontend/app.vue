<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useDropZone } from '@vueuse/core';
import MarkdownRenderer from './MarkdownRenderer.vue';

// Types
interface ChatMessage {
  role: 'bot' | 'user';
  contents: string;
  fileLength: number;
}

interface Thread {
  id: string;
  messages: ChatMessage[];
  workflowAnswers: { [step: string]: string };
}

interface Assistant {
  id: string;
  name: string;
  createdAt: number;
  model: string;
  vector_id: string;
}

// State
const userQuery = ref('');
const activeChatId = ref('');
const threads = ref<Thread[]>([]);
const selectedAttachments = ref<File[]>([]);
const isLoading = ref(false);
const assistants = ref<Assistant[]>([]);
const selectedAssistant = ref<Assistant | null>(null);
const loadingAssistants = ref(false);

// Computed
const activeChat = computed(() => threads.value.find((thread) => thread.id === activeChatId.value));
const availableAssistants = computed(() => assistants.value);

// File handling
const dropZoneRef = ref<HTMLDivElement>();
const { isOverDropZone } = useDropZone(dropZoneRef, {
  onDrop: (files) => {
    if (!files) return;
    const pdfFiles = Array.from(files).filter((file) => file.type === 'application/pdf');
    selectedAttachments.value = [...selectedAttachments.value, ...pdfFiles];
  },
});

// Fetch available assistants
const fetchAssistants = async () => {
  loadingAssistants.value = true;
  try {
    const response = await fetch('/api/assistant', { method: 'GET' });
    const data = await response.json();
    assistants.value = data.assistants;
  } catch (error) {
    console.error('Failed to fetch assistants:', error);
  } finally {
    loadingAssistants.value = false;
  }
};

onMounted(fetchAssistants);

const formatAssistantName = (name: string) => {
  return name.replace(/\.pdf$/i, '');
};

// Create new chat
async function createChat() {
  if (!userQuery.value.trim() || !selectedAssistant.value) return;
  isLoading.value = true;

  try {
    const fileIds: string[] = [];
    if (selectedAttachments.value.length > 0) {
      const formData = new FormData();
      selectedAttachments.value.forEach((file) => formData.append(file.name, file));
      const savedFileIds = await fetch('/api/fs', {
        method: 'POST',
        body: formData,
      }).then((res) => res.json());
      fileIds.push(...savedFileIds);
    }

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-assistant-id': selectedAssistant.value.id,
        'x-vector-id': selectedAssistant.value.vector_id,
      },
      body: JSON.stringify({
        fileIds,
        query: userQuery.value,
        workflowAnswers: {},
      }),
    }).then((res) => res.json());

    const newThread: Thread = {
      id: response.id || Date.now().toString(),
      messages: [
        {
          role: 'user',
          contents: userQuery.value,
          fileLength: fileIds.length,
        },
        {
          role: 'bot',
          contents: response.clarifier ? response.question : response.firstResponse,
          fileLength: 0,
        },
      ],
      workflowAnswers: response.workflowAnswers,
    };

    threads.value.push(newThread);
    activeChatId.value = newThread.id;
    resetForm();
  } catch (error) {
    console.error('Error creating chat:', error);
  } finally {
    isLoading.value = false;
  }
}

// Update existing chat
async function updateChat() {
  if (!userQuery.value.trim() || !activeChatId.value || !selectedAssistant.value) return;
  isLoading.value = true;

  try {
    // Add user message immediately for better UX
    activeChat.value?.messages.push({
      role: 'user',
      contents: userQuery.value,
      fileLength: selectedAttachments.value.length,
    });

    const fileIds: string[] = [];
    if (selectedAttachments.value.length > 0) {
      const formData = new FormData();
      selectedAttachments.value.forEach((file) => formData.append(file.name, file));
      const savedFileIds = await fetch('/api/fs', {
        method: 'POST',
        body: formData,
      }).then((res) => res.json());
      fileIds.push(...savedFileIds);
    }

    const response = await fetch('/api/chat', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-assistant-id': selectedAssistant.value.id,
        'x-chat-id': activeChatId.value,
      },
      body: JSON.stringify({
        fileIds,
        query: userQuery.value,
        workflowAnswers: activeChat.value?.workflowAnswers || {},
      }),
    }).then((res) => res.json());

    if (activeChat.value) {
      activeChat.value.workflowAnswers = response.workflowAnswers;
    }

    // Add bot response
    activeChat.value?.messages.push({
      role: 'bot',
      contents: response.clarifier ? response.question : response.response,
      fileLength: 0,
    });

    resetForm();
  } catch (error) {
    console.error('Error updating chat:', error);
  } finally {
    isLoading.value = false;
  }
}

function resetForm() {
  userQuery.value = '';
  selectedAttachments.value = [];
  nextTick(() => scrollToBottom());
}

function scrollToBottom() {
  const chatContainer = document.querySelector('.chat-messages');
  if (chatContainer) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

function resetAssistant() {
  selectedAssistant.value = null;
  threads.value = [];
  activeChatId.value = '';
  resetForm();
}

// Watch for changes in messages to auto-scroll
watch(
  () => activeChat.value?.messages,
  () => {
    nextTick(() => scrollToBottom());
  },
  { deep: true }
);
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Assistant Selection Screen -->
    <div v-if="!selectedAssistant" class="min-h-screen flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-white rounded-xl shadow-lg p-6 space-y-6">
        <div class="text-center space-y-2">
          <h1 class="text-2xl font-bold text-gray-900">Procure Lens</h1>
          <p class="text-gray-600">Select an Assistant to begin</p>
        </div>

        <div v-if="loadingAssistants" class="flex justify-center py-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>

        <div v-else-if="availableAssistants.length > 0" class="space-y-4">
          <select
            v-model="selectedAssistant"
            class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option disabled value="">Choose an Assistant</option>
            <option v-for="assistant in availableAssistants" :key="assistant.id" :value="assistant">
              {{ formatAssistantName(assistant.name) }}
            </option>
          </select>
        </div>

        <div v-else class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p class="text-yellow-700 text-sm">No assistants found. Please create an assistant first.</p>
        </div>
      </div>
    </div>

    <!-- Chat Interface -->
    <div v-else class="min-h-screen flex flex-col">
      <!-- Header -->
      <header class="bg-white border-b border-gray-200">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between items-center h-16">
            <h1 class="text-xl font-bold text-gray-900">Procure Lens</h1>
            <button
              @click="resetAssistant"
              class="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Change Assistant
            </button>
          </div>
        </div>
      </header>

      <!-- Main Content -->
      <div class="flex-1 flex">
        <!-- Sidebar -->
        <div class="w-64 bg-white border-r border-gray-200 flex flex-col">
          <div class="flex-1 flex flex-col overflow-y-auto">
            <div class="p-4 flex justify-between items-center">
              <span class="text-sm font-medium text-gray-500">Conversations</span>
              <button
                @click="activeChatId = ''"
                class="p-1 rounded-md hover:bg-gray-100"
                title="New Chat"
              >
                <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            <nav class="flex-1 px-2 py-4 space-y-1">
              <a
                v-for="thread in threads"
                :key="thread.id"
                @click="activeChatId = thread.id"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md cursor-pointer"
                :class="thread.id === activeChatId ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'"
              >
                {{ thread.messages[0]?.contents.slice(0, 30) }}...
              </a>
            </nav>
          </div>
        </div>

        <!-- Chat Area -->
        <div class="flex-1 flex flex-col bg-white">
          <div class="flex-1 overflow-y-auto chat-messages p-4 space-y-4">
            <template v-if="activeChat?.messages.length">
              <div
                v-for="message in activeChat.messages"
                :key="message.contents"
                class="flex space-x-3"
                :class="message.role === 'bot' ? 'justify-start' : 'justify-end'"
              >
                <div
                  class="flex-1 max-w-2xl rounded-lg p-4"
                  :class="message.role === 'bot' ? 'bg-gray-100' : 'bg-blue-50 ml-auto'"
                >
                  <div class="flex items-center space-x-2 mb-2">
                    <span class="font-medium">{{ message.role === 'bot' ? 'Assistant' : 'You' }}</span>
                    <span
                      v-if="message.fileLength > 0"
                      class="text-xs bg-gray-200 px-2 py-0.5 rounded-full"
                    >
                      {{ message.fileLength }} file{{ message.fileLength > 1 ? 's' : '' }}
                    </span>
                  </div>
                  <MarkdownRenderer :content="message.contents" />
                </div>
              </div>
            </template>
            <div v-else class="flex items-center justify-center h-full">
              <p class="text-gray-500">Start a new conversation</p>
            </div>
          </div>

          <!-- Input Area -->
          <div
            ref="dropZoneRef"
            class="border-t border-gray-200 p-4"
            :class="{ 'border-blue-400': isOverDropZone }"
          >
            <div class="max-w-4xl mx-auto">
              <div class="flex items-end space-x-2">
                <div class="flex-1">
                  <textarea
                    v-model="userQuery"
                    rows="3"
                    class="w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 resize-none"
                    placeholder="Type your message..."
                    @keydown.enter.prevent="activeChatId ? updateChat() : createChat()"
                  />
                  <div class="mt-2 flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                      <input
                        type="file"
                        multiple
                        accept=".pdf"
                        class="hidden"
                        id="file-upload"
                        @change="(e) => onDrop(e.target.files)"
                      />
                      <label
                        for="file-upload"
                        class="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
                      >
                        Attach Files
                      </label>
                      <span v-if="selectedAttachments.length > 0" class="text-sm text-gray-500">
                        {{ selectedAttachments.length }} file(s) selected
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="!userQuery.trim() || isLoading"
                  @click="activeChatId ? updateChat() : createChat()"
                >
                  <span v-if="isLoading">Sending...</span>
                  <span v-else>Send</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>