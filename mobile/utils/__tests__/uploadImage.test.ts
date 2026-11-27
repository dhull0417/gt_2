// Chat uploads: a GIF goes up byte-for-byte as image/gif; photos keep their JPEG re-save.

const mockBytes = new Uint8Array([71, 73, 70]);
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) { this.uri = uri; }
    async bytes() { return mockBytes; }
  },
}));

const mockManipulate = jest.fn(async (_uri: string, _actions: any, _opts: any) => ({
  base64: 'AAAA',
  width: 1280,
  height: 960,
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (uri: string, actions: any, opts: any) => mockManipulate(uri, actions, opts),
  SaveFormat: { JPEG: 'jpeg' },
}));

jest.mock('expo-image-picker', () => ({}));
jest.mock('../../components/ImageCropperHost', () => ({ requestImageCrop: jest.fn() }));
jest.mock('../permissions', () => ({ reportPermissionStatus: jest.fn() }));

const mockUpload = jest.fn(async (_path: string, _body: any, _opts: any) => ({ error: null }));
jest.mock('../supabase', () => ({
  getSupabaseClient: () => ({
    storage: {
      from: () => ({
        upload: (path: string, body: any, opts: any) => mockUpload(path, body, opts),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }),
      }),
    },
  }),
}));

import { uploadChatGif, uploadImageFromUriWithDimensions } from '../uploadImage';

beforeEach(() => {
  mockUpload.mockClear();
  mockManipulate.mockClear();
});

it("uploads a GIF's original bytes as image/gif", async () => {
  const res = await uploadChatGif('file:///a.gif', 'chat/g/c.gif', 'tok', { width: 320, height: 240 });
  expect(mockManipulate).not.toHaveBeenCalled();
  expect(mockUpload).toHaveBeenCalledWith('chat/g/c.gif', mockBytes, { contentType: 'image/gif', upsert: true });
  expect(res.url).toMatch(/^https:\/\/cdn\/chat\/g\/c\.gif\?t=\d+$/);
  expect(res.width).toBe(320);
  expect(res.height).toBe(240);
});

it('photos still go through the JPEG re-save', async () => {
  await uploadImageFromUriWithDimensions('file:///p.jpg', 'chat-images', 'chat/g/c.jpg', 'tok');
  expect(mockManipulate).toHaveBeenCalled();
  expect(mockUpload).toHaveBeenCalledWith('chat/g/c.jpg', expect.anything(), { contentType: 'image/jpeg', upsert: true });
});
