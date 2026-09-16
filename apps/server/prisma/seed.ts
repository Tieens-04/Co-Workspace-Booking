import { PrismaClient, Role, RoomStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Hash password chung cho seed data (mật khẩu mặc định: Password123@)
  const defaultPasswordHash = await bcrypt.hash('Password123@', 10);

  // 2. Tạo Users (1 ADMIN, 2 CUSTOMER)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@cospace.vn' },
    update: {},
    create: {
      email: 'admin@cospace.vn',
      fullName: 'System Admin',
      passwordHash: defaultPasswordHash,
      phoneNumber: '0901234567',
      role: Role.ADMIN,
    },
  });

  const customer1 = await prisma.user.upsert({
    where: { email: 'nguyenvana@gmail.com' },
    update: {},
    create: {
      email: 'nguyenvana@gmail.com',
      fullName: 'Nguyễn Văn A',
      passwordHash: defaultPasswordHash,
      phoneNumber: '0912345678',
      role: Role.CUSTOMER,
    },
  });

  const customer2 = await prisma.user.upsert({
    where: { email: 'tranthib@gmail.com' },
    update: {},
    create: {
      email: 'tranthib@gmail.com',
      fullName: 'Trần Thị B',
      passwordHash: defaultPasswordHash,
      phoneNumber: '0923456789',
      role: Role.CUSTOMER,
    },
  });

  console.log(
    `✅ Seeded users: 1 Admin (${admin.email}), 2 Customers (${customer1.email}, ${customer2.email})`,
  );

  // 3. Tạo Tiện ích (Amenities)
  const amenitiesData = [
    {
      name: 'High-Speed Wi-Fi',
      icon: 'wifi',
      description: 'Kết nối Internet cáp quang tốc độ cao 300Mbps',
    },
    {
      name: 'Monitor 4K',
      icon: 'monitor',
      description: 'Màn hình Dell UltraSharp 27 inch 4K Type-C',
    },
    { name: 'Whiteboard', icon: 'clipboard', description: 'Bảng từ trắng cỡ lớn và bút viết' },
    { name: 'Projector', icon: 'projector', description: 'Máy chiếu Full HD sắc nét và màn chiếu' },
    {
      name: 'Soundproof',
      icon: 'volume-x',
      description: 'Cách âm tiêu chuẩn cho cuộc họp riêng tư',
    },
    {
      name: 'Free Coffee & Tea',
      icon: 'coffee',
      description: 'Cà phê pha máy và trà thảo mộc miễn phí tại quầy',
    },
  ];

  const amenities = [];
  for (const item of amenitiesData) {
    const amenity = await prisma.amenity.upsert({
      where: { name: item.name },
      update: {},
      create: item,
    });
    amenities.push(amenity);
  }
  console.log(`✅ Seeded ${amenities.length} amenities.`);

  // 4. Tạo 4 Phòng mẫu (Rooms)
  const roomsData = [
    {
      name: 'Hot Desk Focus 01',
      description:
        'Chỗ ngồi cá nhân yên tĩnh, trang bị ghế công thái học, phù hợp làm việc tập trung cao độ.',
      capacity: 1,
      pricePerHour: 40000.0,
      status: RoomStatus.AVAILABLE,
      amenityNames: ['High-Speed Wi-Fi', 'Free Coffee & Tea', 'Monitor 4K'],
      images: [
        {
          imageUrl: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=800',
          isPrimary: true,
        },
        {
          imageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800',
          isPrimary: false,
        },
      ],
    },
    {
      name: 'Private Studio Pod A',
      description:
        'Phòng làm việc mini cá nhân cách âm tuyệt đối, thích hợp thực hiện cuộc gọi video, phỏng vấn hoặc ghi âm podcast.',
      capacity: 2,
      pricePerHour: 90000.0,
      status: RoomStatus.AVAILABLE,
      amenityNames: ['High-Speed Wi-Fi', 'Soundproof', 'Monitor 4K', 'Free Coffee & Tea'],
      images: [
        {
          imageUrl: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800',
          isPrimary: true,
        },
      ],
    },
    {
      name: 'Meeting Room Creative 4P',
      description:
        'Phòng họp nhóm 4 người với bàn tròn thảo luận, bảng viết kích thước lớn và màn hình trình chiếu.',
      capacity: 4,
      pricePerHour: 180000.0,
      status: RoomStatus.AVAILABLE,
      amenityNames: [
        'High-Speed Wi-Fi',
        'Whiteboard',
        'Monitor 4K',
        'Soundproof',
        'Free Coffee & Tea',
      ],
      images: [
        {
          imageUrl: 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=800',
          isPrimary: true,
        },
        {
          imageUrl: 'https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800',
          isPrimary: false,
        },
      ],
    },
    {
      name: 'Boardroom Executive 12P',
      description:
        'Phòng họp cao cấp sức chứa 12 người, trang bị máy chiếu, hệ thống mic họp trực tuyến và view nhìn toàn cảnh thành phố.',
      capacity: 12,
      pricePerHour: 450000.0,
      status: RoomStatus.AVAILABLE,
      amenityNames: [
        'High-Speed Wi-Fi',
        'Projector',
        'Whiteboard',
        'Soundproof',
        'Free Coffee & Tea',
      ],
      images: [
        {
          imageUrl: 'https://images.unsplash.com/photo-1431540015161-0bf868a2d407?w=800',
          isPrimary: true,
        },
        {
          imageUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800',
          isPrimary: false,
        },
      ],
    },
  ];

  for (const roomItem of roomsData) {
    const { amenityNames, images, ...roomFields } = roomItem;

    // Tìm room theo tên hoặc tạo mới
    const existingRoom = await prisma.room.findFirst({
      where: { name: roomFields.name },
    });

    const room = existingRoom
      ? await prisma.room.update({
          where: { id: existingRoom.id },
          data: roomFields,
        })
      : await prisma.room.create({
          data: roomFields,
        });

    // Cập nhật Images
    await prisma.roomImage.deleteMany({ where: { roomId: room.id } });
    await prisma.roomImage.createMany({
      data: images.map((img) => ({
        roomId: room.id,
        imageUrl: img.imageUrl,
        isPrimary: img.isPrimary,
      })),
    });

    // Cập nhật Amenities liên kết
    await prisma.roomAmenity.deleteMany({ where: { roomId: room.id } });
    const matchedAmenities = amenities.filter((a) => amenityNames.includes(a.name));
    await prisma.roomAmenity.createMany({
      data: matchedAmenities.map((a) => ({
        roomId: room.id,
        amenityId: a.id,
      })),
    });
  }

  console.log(`✅ Seeded ${roomsData.length} sample rooms with images and amenities.`);
  console.log('🎉 Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
