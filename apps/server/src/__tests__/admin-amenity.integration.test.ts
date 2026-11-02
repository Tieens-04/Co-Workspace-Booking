import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Prisma, Role, RoomStatus } from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { generateToken } from '../utils/jwt.util.js';

describe('Admin amenity catalog (CWB-65, real MySQL)', () => {
  const tag = randomUUID().slice(0, 8);
  const adminToken = generateToken({ sub: `admin-${tag}`, role: Role.ADMIN });
  const customerToken = generateToken({ sub: `customer-${tag}`, role: Role.CUSTOMER });
  const amenityIds: string[] = [];
  const roomIds: string[] = [];
  const name = (label: string) => `Bench ${tag} ${label}`;
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

  const createAmenity = async (label: string, body: Record<string, unknown> = {}) => {
    const res = await asAdmin(request(app).post('/api/v1/admin/amenities')).send({
      name: name(label),
      ...body,
    });
    if (res.status === 201) amenityIds.push(res.body.data.id);
    return res;
  };

  afterAll(async () => {
    await prisma.roomAmenity.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.amenity.deleteMany({ where: { id: { in: amenityIds } } });
  });

  it('requires an ADMIN token', async () => {
    const anonymous = await request(app)
      .post('/api/v1/admin/amenities')
      .send({ name: name('x') });
    expect(anonymous.status).toBe(401);
    const customer = await request(app)
      .post('/api/v1/admin/amenities')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ name: name('x') });
    expect(customer.status).toBe(403);
    for (const method of ['get', 'patch', 'delete'] as const) {
      const path =
        method === 'get' ? '/api/v1/admin/amenities' : `/api/v1/admin/amenities/${randomUUID()}`;
      const res = await request(app)[method](path).set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    }
  });

  it('creates an amenity with trimmed fields, visible in the public catalog', async () => {
    const res = await createAmenity('Wifi', {
      icon: 'wifi',
      description: '  Mạng tốc độ cao  ',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      name: name('Wifi'),
      icon: 'wifi',
      description: 'Mạng tốc độ cao',
    });
    const publicList = await request(app).get('/api/v1/amenities');
    expect(publicList.body.data.map((a: { id: string }) => a.id)).toContain(res.body.data.id);
  });

  it('rejects duplicate names (case-insensitive) and invalid input', async () => {
    await createAmenity('Coffee');
    const duplicate = await asAdmin(request(app).post('/api/v1/admin/amenities')).send({
      name: name('coffee').toUpperCase(),
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('AMENITY_NAME_EXISTS');

    for (const body of [
      { name: '   ' },
      { name: name('Bad icon'), icon: 'Wifi Icon!' },
      { name: name('Extra'), roomCount: 3 },
    ]) {
      const res = await asAdmin(request(app).post('/api/v1/admin/amenities')).send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('updates fields, clears optional ones, and maps conflicts/not-found', async () => {
    const created = await createAmenity('Projector', {
      icon: 'projector',
      description: 'Máy chiếu',
    });
    const other = await createAmenity('Whiteboard');
    const id = created.body.data.id;

    const updated = await asAdmin(request(app).patch(`/api/v1/admin/amenities/${id}`)).send({
      name: name('Projector 4K'),
      description: '',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      name: name('Projector 4K'),
      icon: 'projector',
      description: null,
    });

    const clash = await asAdmin(request(app).patch(`/api/v1/admin/amenities/${id}`)).send({
      name: other.body.data.name,
    });
    expect(clash.status).toBe(409);

    const missing = await asAdmin(
      request(app).patch(`/api/v1/admin/amenities/${randomUUID()}`),
    ).send({ name: name('Ghost') });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('AMENITY_NOT_FOUND');

    const empty = await asAdmin(request(app).patch(`/api/v1/admin/amenities/${id}`)).send({});
    expect(empty.status).toBe(400);
  });

  it('refuses to delete an amenity assigned to a room and keeps the link; room filter still works', async () => {
    const created = await createAmenity('Soundproof');
    const amenityId = created.body.data.id;
    const room = await prisma.room.create({
      data: {
        name: `Room ${tag}`,
        capacity: 4,
        pricePerHour: new Prisma.Decimal('100000.00'),
        status: RoomStatus.AVAILABLE,
        amenities: { create: { amenityId } },
      },
    });
    roomIds.push(room.id);

    const list = await asAdmin(request(app).get('/api/v1/admin/amenities'));
    expect(list.body.data.find((a: { id: string }) => a.id === amenityId)).toMatchObject({
      roomCount: 1,
    });

    const res = await asAdmin(request(app).delete(`/api/v1/admin/amenities/${amenityId}`));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('AMENITY_IN_USE');
    expect(res.body.details).toEqual({ roomCount: 1 });
    expect(await prisma.roomAmenity.count({ where: { amenityId } })).toBe(1);

    await asAdmin(request(app).patch(`/api/v1/admin/amenities/${amenityId}`)).send({
      name: name('Soundproof Pro'),
    });
    const filtered = await request(app).get(`/api/v1/rooms?amenityIds=${amenityId}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.items.map((r: { id: string }) => r.id)).toContain(room.id);
  });

  it('deletes an unused amenity and returns 404 afterwards', async () => {
    const created = await createAmenity('Temporary');
    const id = created.body.data.id;

    const res = await asAdmin(request(app).delete(`/api/v1/admin/amenities/${id}`));
    expect(res.status).toBe(200);
    expect(await prisma.amenity.findUnique({ where: { id } })).toBeNull();

    const again = await asAdmin(request(app).delete(`/api/v1/admin/amenities/${id}`));
    expect(again.status).toBe(404);
  });
});
