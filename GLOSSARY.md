# Co-Space Working

A coworking space management and room booking platform connecting customers with workspace inventory and providing admin operational controls.

## Language

**Customer**:
A registered user who searches for rooms and books reservations under their own account.
_Avoid_: Client, buyer, account holder

**Guest**:
An unregistered walk-in visitor whose room reservation is placed on their behalf by an Admin using contact information (full name and phone number) without creating a user account.
_Avoid_: Anonymous user, walk-in customer, unregistered account

**Booking**:
A time-bounded reservation of a specific room for a designated period, either associated with a registered Customer or an unregistered Guest.
_Avoid_: Reservation, order, rental slot

**Admin Booking**:
An operational action performed by an authorized Administrator to view/filter reservations or create a walk-in Booking on behalf of a Guest.
_Avoid_: Staff booking, internal reservation

**Room**:
A rentable workspace unit characterized by capacity, hourly price, amenities, and operational availability status.
_Avoid_: Workspace unit, office, venue
