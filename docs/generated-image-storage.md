# Generated image storage

Generated images are stored in Vercel Blob under `art/<category>/day-<DDD>/`. The generator validates the category server-side.

| Category | Blob prefix | Use |
| --- | --- | --- |
| Střípky | `art/fragments/` | Short life fragments and legacy images |
| Kronika | `art/chronicle/` | Images created from Chronicle chapters |
| Postavy | `art/characters/` | Character artwork |
| Předměty | `art/items/` | Item artwork |
| Mapy | `art/maps/` | World, regional, and battle maps |
| Místa | `art/locations/` | Locations and buildings |
| Bytosti | `art/creatures/` | Creatures and companions |
| Scény | `art/scenes/` | Reusable scene illustrations |

Filename pattern: `<slug>-<timestamp>.<extension>`. Existing files remain in `art/fragments/`; they are not moved or renamed.
