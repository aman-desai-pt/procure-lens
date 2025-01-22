<script setup lang="ts">
import { useDropZone, useStorage } from '@vueuse/core';

type TenantInfo = {
  assistantId: string;
  vector: string;
  datasource: {
    totalFiles: number;
  };
  threads: {
    id: string;
    messages: {
      role: 'bot' | 'user';
      contents: string;
      fileLength: number;
    }[];
  }[];
};

const tenantIdInput = ref('');
const tenantId = ref('');
const tenantInfo = ref<TenantInfo>();

const activeChatId = ref<string>();
const chats = computed<TenantInfo['threads']>(() => tenantInfo.value?.threads || []);
const activeChat = computed<TenantInfo['threads'][number] | undefined>(() =>
  activeChatId.value ? tenantInfo.value?.threads.find((t) => t.id === activeChatId.value) : undefined
);
const userQuery = ref<string>('');

const tenantInfoStore = useStorage<Record<string, TenantInfo>>('tenantInfoStore', {});

/** Assistant creat / load logic START */
const loadTenant = async () => {
  if (!tenantIdInput.value) return;
  tenantInfo.value = tenantInfoStore.value[tenantIdInput.value];
  if (!tenantInfo.value) {
    const { id, vector } = await $fetch('/api/assistant', { method: 'POST' });
    tenantInfo.value = {
      assistantId: id,
      vector,
      datasource: {
        totalFiles: 0,
      },
      threads: [],
    };
    tenantInfoStore.value[tenantIdInput.value] = tenantInfo.value;
  }
  tenantId.value = tenantIdInput.value;
  tenantIdInput.value = '';
};
/** Assistant creat / load logic END */

/** Datasource logic START */
const datasourceDropZone = ref<HTMLDivElement>();
const selectedDatasources = ref<File[]>([]);

function onDropDatasource(_files: File[] | FileList | null) {
  if (_files == null) return;
  const files = Array.from(_files) as File[];
  if (files && files.length > 0) {
    selectedDatasources.value = [...selectedDatasources.value, ...files];
  }
}
function onDatasourceSelect(event: Event) {
  onDropDatasource((event.target as HTMLInputElement)?.files);
}
const { isOverDropZone: isOverDataSourceDropZone } = useDropZone(datasourceDropZone, {
  multiple: true,
  onDrop,
  dataTypes: ['application/pdf'],
});
/** Datasource logic END */

/** Attachment logic START */
const attachmentDropZone = ref<HTMLDivElement>();
const selectedAttachments = ref<File[]>([]);

function onDrop(_files: File[] | FileList | null) {
  if (_files == null) return;
  const files = Array.from(_files) as File[];
  if (files && files.length > 0) {
    selectedAttachments.value = [...selectedAttachments.value, ...files];
  }
}
function onAttachmentSelect(event: Event) {
  onDrop((event.target as HTMLInputElement)?.files);
}
const { isOverDropZone } = useDropZone(attachmentDropZone, {
  multiple: true,
  onDrop,
  dataTypes: ['application/pdf'],
});
/** Attachment logic END */

/** Chat creation logic START */
const createChat = async () => {
  if (!userQuery.value) return;
  if (!tenantInfo.value) return;
  const fileIds: string[] = [];
  if (selectedAttachments.value.length > 0) {
    const formData = new FormData();
    selectedAttachments.value.forEach((f) => {
      formData.append(f.name, f);
    });
    const savedFileIds = await $fetch('/api/fs', {
      method: 'POST',
      body: formData,
    });
    fileIds.push(...savedFileIds);
  }
  const { id, firstResponse } = await $fetch('/api/chat', {
    method: 'POST',
    headers: {
      'x-assistant-id': tenantInfo.value.assistantId,
      'x-vector-id': tenantInfo.value.vector,
    },
    body: {
      fileIds,
      query: userQuery.value,
    },
  });

  if (!tenantInfo.value.threads) {
    tenantInfo.value.threads = [];
  }
  tenantInfo.value.threads.push({
    id,
    messages: [
      {
        role: 'user',
        contents: userQuery.value,
        fileLength: fileIds.length,
      },
      {
        role: 'bot',
        contents: firstResponse,
        fileLength: 0,
      },
    ],
  });

  activeChatId.value = id;
  userQuery.value = '';
  selectedAttachments.value = [];
};
/** Chat creation logic END */

/** Chat updation logic START */
const updateChat = async () => {
  if (!userQuery.value) return;
  if (!tenantInfo.value) return;
  if (!activeChatId.value) return;

  activeChat.value!.messages.push({
    role: 'user',
    contents: userQuery.value,
    fileLength: selectedAttachments.value.length,
  });

  const attachments = selectedAttachments.value;
  selectedAttachments.value = [];

  const query = userQuery.value;
  userQuery.value = '';

  const fileIds: string[] = [];
  if (attachments.length > 0) {
    const formData = new FormData();
    attachments.forEach((f) => {
      formData.append(f.name, f);
    });
    const savedFileIds = await $fetch('/api/fs', {
      method: 'POST',
      body: formData,
    });
    fileIds.push(...savedFileIds);
  }
  const { response } = await $fetch('/api/chat', {
    method: 'PUT',
    headers: {
      'x-assistant-id': tenantInfo.value.assistantId,
      'x-chat-id': activeChatId.value,
    },
    body: {
      fileIds,
      query,
    },
  });

  activeChat.value!.messages.push({
    role: 'bot',
    contents: response,
    fileLength: 0,
  });
};
/** Chat updation logic END */

/** Datasource updation logic START */
const updateDatasource = async () => {
  if (!tenantInfo.value) return;
  if (!selectedDatasources.value) return;
  const fileIds: string[] = [];
  const formData = new FormData();
  selectedDatasources.value.forEach((f) => {
    formData.append(f.name, f);
  });
  const savedFileIds = await $fetch('/api/fs', {
    method: 'POST',
    body: formData,
  });
  fileIds.push(...savedFileIds);

  await $fetch('/api/assistant', {
    method: 'PUT',
    headers: {
      'x-assistant-id': tenantInfo.value!.assistantId,
      'x-vector-id': tenantInfo.value!.vector,
    },
    body: {
      fileIds,
    },
  });

  tenantInfo.value.datasource.totalFiles += fileIds.length;

  selectedDatasources.value = [];
};
/** Datasource updation logic END */
</script>

<template>
  <main class="w-full flex items-center justify-center min-h-screen" v-if="!tenantId">
    <div class="flex flex-col w-1/4 space-y-3">
      <span class="text-2xl font-noto font-black text-center">Procure Lens</span>
      <span class="text-md text-center">Login as tenant</span>
      <input type="text" placeholder="Tenant ID" class="input input-bordered input-md w-full" v-model="tenantIdInput" />
      <button class="btn w-full btn-sm btn-secondary" @click="loadTenant">Login</button>
    </div>
  </main>
  <main class="min-h-screen bg-zinc-100" v-else>
    <div class="flex items-center justify-between h-16 py-2 px-4">
      <div class="text-xl font-noto font-extrabold">Procure Lens</div>
      <div class="flex space-x-2 items-center">
        <span class="text-zinc-600 font-extrabold">{{ tenantId }}</span>
        <button class="btn btn-square btn-ghost text-red-600 btn-xs" @click="tenantId = ''">
          <Icon name="solar:logout-bold-duotone" class="w-6 h-6" />
        </button>
      </div>
    </div>
    <div class="flex h-[calc(100vh-64px)]">
      <div class="flex flex-col w-72 h-full justify-between p-2 pl-4">
        <div class="flex flex-col space-y-2">
          <div class="flex w-full justify-between items-center mb-2">
            <span class="text-sm font-bold px-2" v-if="chats.length > 0">Previous Chats</span>
            <button class="btn btn-xs btn-square" @click="activeChatId = undefined">
              <Icon name="wpf:create-new" class="w-3 h-3" />
            </button>
          </div>
          <a
            class="w-full text-sm py-2 cursor-pointer hover:bg-blue-50 border border-transparent hover:border p-2 rounded-lg"
            :class="{ 'bg-blue-50 !border-blue-400': chat.id === activeChatId }"
            v-for="chat in chats"
            :key="chat.id"
            @click="activeChatId = chat.id"
          >
            {{ chat.messages[0]!.contents.slice(0, 25) }}...
          </a>
        </div>
        <div class="my-4 text-center flex flex-col space-y-1" v-if="chats.length === 0">
          <span class="text-sm font-bold text-zinc-400">No chats found</span>
          <span class="text-xs text-zinc-400">Start a new chat</span>
        </div>
        <div class="flex flex-col text-center">
          <button class="btn w-full btn-sm btn-secondary mb-2" onclick="my_modal_1.showModal()">
            <Icon name="humbleicons:upload" class="w-5 h-5" />
            Add Data Source
          </button>
          <span class="text-xs">{{ tenantInfo!.datasource.totalFiles }} file(s) added</span>
        </div>
      </div>
      <div
        class="flex justify-center h-full w-full bg-white rounded-xl border m-4 -mt-2"
        :class="`${activeChat ? 'items-start' : 'items-center'}`"
        ref="attachmentDropZone"
      >
        <div class="flex flex-col max-w-[780px] w-full text-center space-y-8 -mt-32" v-if="!activeChat">
          <span class="text-3xl font-bold font-noto text-blue-700">What can I help with?</span>
          <div
            class="w-full rounded-lg flex flex-col p-1 border border-blue-100 bg-zinc-50 focus-within:ring-1 focus-within:ring-blue-400"
            :class="{ 'ring-1 ring-blue-400': isOverDropZone }"
            @submit.stop="createChat"
          >
            <div class="flex items-start w-full justify-between">
              <textarea
                type="text"
                class="focus:ring-0 focus:outline-none w-11/12 h-20 rounded-lg text-sm p-2 resize-none bg-zinc-50"
                placeholder="Message Procure Lens"
                v-model="userQuery"
              />
              <button type="submit" class="w-8 h-8 btn btn-xs btn-secondary btn-square" @click.stop="createChat">
                <Icon name="uil:message" class="w-5 h-5" />
              </button>
            </div>
            <div class="flex w-full justify-between items-center">
              <input
                id="attach-button"
                type="file"
                class="hidden"
                accept=".pdf"
                @change="onAttachmentSelect"
                multiple
              />
              <label for="attach-button" class="btn btn-ghost btn-secondary btn-sm text-secondary px-1">
                <Icon name="fluent:attach-20-filled" class="w-5 h-5" />
                <div class="flex flex-col text-left">
                  <span class="text-xs">Attach File</span>
                  <span class="font-extralight text-[8px] -mt-1">Drop PDF file(s) to attach</span>
                </div>
              </label>
              <div class="badge badge-secondary badge-sm badge-outline p-0 pl-2" v-if="selectedAttachments.length > 0">
                <span>{{ selectedAttachments.length }} file{{ selectedAttachments.length > 1 ? 's' : '' }}</span>
                <button class="btn btn-xs btn-ghost btn-square text-zinc-400" @click="selectedAttachments = []">
                  <Icon name="carbon:close-filled" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-col h-full w-full" v-else>
          <div class="flex flex-col items-center justtify-start w-full h-4/5 p-4 space-y-6 relative overflow-y-scroll">
            <div v-for="(message, i) in activeChat.messages" class="flex w-2/3 space-x-2">
              <div class="avatar">
                <div class="w-8 rounded-xl">
                  <Icon name="fluent:bot-48-regular" class="w-8 h-8 text-blue-500" v-if="message.role == 'bot'" />
                  <Icon name="mdi:user" class="w-8 h-8 text-primary" v-else />
                </div>
              </div>
              <div class="flex flex-col">
                <span>{{ message.contents }}</span>
                <span class="badge badge-secondary badge-sm badge-outline p-0 px-2" v-if="message.fileLength > 0">
                  {{ message.fileLength }} file{{ message.fileLength > 1 ? 's' : '' }}
                </span>
              </div>
            </div>
          </div>
          <div class="w-2/3 mx-auto h-32">
            <div
              class="w-full rounded-lg flex flex-col p-1 border border-blue-100 bg-zinc-50 focus-within:ring-1 focus-within:ring-blue-400"
              :class="{ 'ring-1 ring-blue-400': isOverDropZone }"
            >
              <div class="flex items-start w-full justify-between">
                <textarea
                  type="text"
                  class="focus:ring-0 focus:outline-none w-11/12 h-20 rounded-lg text-sm p-2 resize-none bg-zinc-50"
                  placeholder="Message Procure Lens"
                  v-model="userQuery"
                />
                <button type="submit" class="w-8 h-8 btn btn-xs btn-secondary btn-square" @click="updateChat">
                  <Icon name="uil:message" class="w-5 h-5" />
                </button>
              </div>
              <div class="flex w-full justify-between items-center">
                <input
                  id="attach-button"
                  type="file"
                  class="hidden"
                  accept=".pdf"
                  @change="onAttachmentSelect"
                  multiple
                />
                <label for="attach-button" class="btn btn-ghost btn-secondary btn-sm text-secondary px-1">
                  <Icon name="fluent:attach-20-filled" class="w-5 h-5" />
                  <div class="flex flex-col text-left">
                    <span class="text-xs">Attach File</span>
                    <span class="font-extralight text-[8px] -mt-1">Drop PDF file(s) to attach</span>
                  </div>
                </label>
                <div
                  class="badge badge-secondary badge-sm badge-outline p-0 pl-2"
                  v-if="selectedAttachments.length > 0"
                >
                  <span>{{ selectedAttachments.length }} file{{ selectedAttachments.length > 1 ? 's' : '' }}</span>
                  <button class="btn btn-xs btn-ghost btn-square text-zinc-400" @click="selectedAttachments = []">
                    <Icon name="carbon:close-filled" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <dialog id="my_modal_1" class="modal">
      <div class="modal-box">
        <div class="max-w-xl" ref="datasourceDropZone">
          <label
            class="flex justify-center w-full h-32 px-4 transition bg-white border border-dashed rounded-md appearance-none cursor-pointer focus:outline-none"
            :class="isOverDataSourceDropZone ? 'border-blue-400' : 'border-gray-300'"
          >
            <span class="flex items-center justify-center space-x-2">
              <span class="text-sm text-gray-600 text-center">
                <Icon name="mage:image-upload" class="w-6 h-6 text-gray-600" /><br />
                Drop image to Attach, or
                <span class="text-blue-600 underline">browse</span><br />
                <span class="text-xs text-gray-400">Supported Formats: pdf</span>
              </span>
            </span>
            <input
              type="file"
              name="file_upload"
              class="hidden"
              accept="application/pdf"
              @change="onDatasourceSelect"
              multiple
            />
          </label>
        </div>
        <div class="flex justify-between items-center mt-2">
          <div>
            <div class="badge badge-secondary badge-sm badge-outline p-0 pl-2" v-if="selectedDatasources.length > 0">
              <span>{{ selectedDatasources.length }} file{{ selectedDatasources.length > 1 ? 's' : '' }}</span>
              <button class="btn btn-xs btn-ghost btn-square text-zinc-400" @click="selectedDatasources = []">
                <Icon name="carbon:close-filled" />
              </button>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <form method="dialog">
              <!-- if there is a button in form, it will close the modal -->
              <button class="btn btn-sm">Close</button>
            </form>
            <button class="btn btn-secondary btn-sm" @click="updateDatasource">Add Datasource</button>
          </div>
        </div>
      </div>
    </dialog>
  </main>
</template>
