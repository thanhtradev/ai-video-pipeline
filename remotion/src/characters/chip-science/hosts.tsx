import React from 'react';
import { Character, CharacterProps, Item } from '../../rig/Character';

/**
 * Science channel – main-character candidates. Same rig as TikTok 2 (src/tiktok2/ep1/Character):
 * each host is a fixed set of props; the user picks one from the rendered sheets (HostSheets.tsx).
 * Names and looks are video content, so they are Vietnamese.
 */
type HostProps = Omit<CharacterProps, 'hoodieColor'> & { readonly hoodieColor?: string };

export type HostDef = {
  readonly id: number;
  readonly name: string;
  /** one-line personality, shown under the character on the sheets */
  readonly tagline: string;
  readonly hoodie: string;
  readonly item?: Item;
  readonly props: Omit<CharacterProps, 'hoodieColor' | 'itemR'>;
  /** `characters[]` entry for an episode brief (name ≤ 40, look ≤ 300) */
  readonly look: string;
  readonly Host: React.FC<HostProps>;
};

const defineHost = (h: Omit<HostDef, 'Host'>): HostDef => ({
  ...h,
  Host: (p) => (
    <Character
      seed={200 + h.id}
      hoodieColor={h.hoodie}
      {...(h.item ? { itemR: h.item } : {})}
      {...h.props}
      {...p}
      accessories={[...(h.props.accessories ?? []), ...(p.accessories ?? [])]}
    />
  ),
});

export const HOSTS: readonly HostDef[] = [
  defineHost({
    id: 1,
    name: 'Tí Mô',
    tagline: 'Tò mò, hỏi "tại sao?" trước khi trả lời',
    hoodie: '#2f6df6',
    item: 'chalk',
    props: { size: 0.96, accessories: ['glassesRound', 'backpack'] },
    look: 'thiếu niên, hoodie XANH CÔ-BAN, kính tròn, đeo balo, hay cầm phấn vẽ lên không trung.',
  }),
  defineHost({
    id: 2,
    name: 'Giáo sư Mộc',
    tagline: 'Điềm tĩnh, hài khô, vẽ bảng là hiểu',
    hoodie: '#1f9a56',
    item: 'paper',
    props: { size: 1.08, sleeve: 0.7, hair: true, accessories: ['labCoat', 'glassesSquare'] },
    look: 'người lớn, hoodie XANH RỪNG dưới áo blouse trắng mở, kính vuông, tóc rối, cầm xấp giấy.',
  }),
  defineHost({
    id: 3,
    name: 'Chíp',
    tagline: 'Robot nhỏ, hiểu nghĩa đen, kêu bíp khi hào hứng',
    hoodie: '#4fb8c9',
    props: { size: 0.9, accessories: ['antenna', 'visor', 'gloves'] },
    look: 'robot nhỏ, hoodie XANH NGỌC, ăng-ten đèn nháy trên đầu, kính che mắt trong suốt, găng tay xám.',
  }),
  defineHost({
    id: 4,
    name: 'Neo',
    tagline: 'Nhà thám hiểm vũ trụ, mê thí nghiệm tưởng tượng',
    hoodie: '#7b3fe4',
    props: { size: 1, accessories: ['helmet', 'backpack'] },
    look: 'thiếu niên, hoodie TÍM, đội mũ vũ trụ vòm trong suốt, đeo balo.',
  }),
  defineHost({
    id: 5,
    name: 'Hạt Tiêu',
    tagline: 'Thí nghiệm nổ tung, học bằng cách phá',
    hoodie: '#ffc21a',
    item: 'lighter',
    props: { size: 0.94, hair: true, accessories: ['goggles', 'gloves'] },
    look: 'thiếu niên nhỏ con, hoodie VÀNG, kính bảo hộ đẩy lên trán, găng tay, tóc dựng, cầm bật lửa.',
  }),
  defineHost({
    id: 6,
    name: 'Sao',
    tagline: 'Nói nhanh, mê số liệu và biểu đồ',
    hoodie: '#14b8a6',
    item: 'phone',
    props: { size: 0.98, accessories: ['ponytail', 'glassesRound', 'clip'] },
    look: 'thiếu nữ, hoodie XANH BẠC HÀ, tóc đuôi ngựa, kính tròn, kẹp tóc hồng, luôn cầm điện thoại.',
  }),
  defineHost({
    id: 7,
    name: 'Cú',
    tagline: 'Thám tử lật tẩy tin đồn: "sự thật là…"',
    hoodie: '#e8452c',
    item: 'detector',
    props: { size: 1, accessories: ['hoodUp', 'headphones'] },
    look: 'thiếu niên, hoodie SAN HÔ trùm đầu, tai nghe chụp ngoài mũ, cầm máy dò, hay nheo mắt.',
  }),
];

/** Brief/script form of the candidates (`characters[]` of the episode script schema). */
export const SCIENCE_CHARACTERS = HOSTS.map((h) => ({ name: h.name.toUpperCase(), look: h.look }));

export const hostById = (id: number): HostDef | undefined => HOSTS.find((h) => h.id === id);
