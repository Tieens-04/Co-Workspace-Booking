# Guest Booking Identity Model

To support walk-in room reservations made by administrators on behalf of unregistered visitors without requiring account pre-registration, we store `guestName` and `guestPhone` directly on the `Booking` model while making `userId` nullable. This avoids creating dummy or ghost user records in the `users` table while enforcing at the application and repository layer that every booking must have either a valid `userId` or both `guestName` and `guestPhone`.

## Status

Accepted

## Considered Options

1. **Ghost User Accounts**: Creating synthetic `User` rows with randomized emails and placeholder credentials for each guest. Rejected because it pollutes user identity tables, bypasses real authentication boundaries, and risks email collisions.
2. **Separate Guest Entity Table**: Creating a dedicated `guests` table referenced by a `guest_id` foreign key. Deferred because walk-in visitors currently lack distinct lifecycle operations beyond being contact references on reservations.
3. **Embedded Guest Contact on Booking**: Making `userId` optional and embedding `guestName` and `guestPhone` directly into the `bookings` table. Accepted for clean query ergonomics, zero table joins, and transactional simplicity.

## Consequences

- The `userId` foreign key on `bookings` is nullable.
- All booking creation and validation paths must enforce mutual exclusivity: either a booking belongs to a registered `Customer` (`userId`), or it has complete `Guest` contact details (`guestName` and `guestPhone`). It must never allow both or neither.
- Customer-scoped queries automatically filter out guest bookings (`WHERE user_id = :userId`), preserving customer data privacy and boundary isolation.
