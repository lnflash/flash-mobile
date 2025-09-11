# Merchant Badges Implementation Guide

## Overview
This guide explains how to manage merchant service badges in the Flash mobile app and structure the backend to support them.

## Frontend Badge System

### Current Badge Configuration
The app displays 4 service badges for each merchant:
- **Flash Accepted** (`acceptsFlash`) - Green checkmark
- **Cash Services** (`redeemTopup`) - Red refresh icon  
- **Loyalty Rewards** (`hasRewards`) - Yellow gift
- **Bitcoin Exchange** (`sellsBitcoin`) - Orange Bitcoin logo

### How Badges Work
```typescript
// In CustomMarker.tsx
const SERVICE_BADGES = [
  {
    key: "acceptsFlash",      // Property name from backend
    icon: "checkmark-circle", // Icon to display
    activeStyle: "acceptedBadgeIcon", // Style when active
    label: "✅ Flash Payments",
    description: "Accepts instant Bitcoin payments via Flash app and Flashcards",
  },
  // ... other badges
]
```

## Disabling Badges

### Method 1: Backend Control (Recommended)
Set the property to `false` in the database:
```json
{
  "username": "merchant123",
  "acceptsFlash": false,    // Badge will be grayed out
  "redeemTopup": true,      // Badge will be active
  "hasRewards": false,      // Badge will be grayed out
  "sellsBitcoin": true      // Badge will be active
}
```

### Method 2: Omit Properties
If a property is not included, it defaults to `false`:
```json
{
  "username": "merchant123",
  "acceptsFlash": true,      // Only this badge will be active
  // Other badges will be grayed out by default
}
```

### Method 3: Frontend Override
To temporarily disable all badges for testing:
```typescript
// In CustomMarker.tsx, modify the ServiceBadge render:
{SERVICE_BADGES.map((badge) => (
  <ServiceBadge
    key={badge.key}
    isActive={false} // Force all badges to be disabled
    // ... other props
  />
))}
```

## Backend MongoDB Schema Update

### Updated Merchant Schema
```javascript
const MerchantSchema = new Schema<MerchantRecord>({
  id: {
    type: String,
    index: true,
    unique: true,
    sparse: true,
    required: true,
    default: () => crypto.randomUUID(),
  },
  username: {
    type: String,
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
  },
  location: {
    type: pointSchema,
    index: "2dsphere",
    required: true,
  },
  // NEW: Service badge fields
  acceptsFlash: {
    type: Boolean,
    default: true, // Most merchants accept Flash payments
    index: true,
  },
  redeemTopup: {
    type: Boolean,
    default: false, // Only some merchants offer cash services
    index: true,
  },
  hasRewards: {
    type: Boolean,
    default: false, // Loyalty program opt-in
    index: true,
  },
  sellsBitcoin: {
    type: Boolean,
    default: false, // Bitcoin exchange is specialized service
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  validated: {
    type: Boolean,
    default: false,
    index: true,
  },
})
```

### TypeScript Interface Update
```typescript
interface MerchantRecord {
  id: string
  username: string
  title: string
  location: {
    type: "Point"
    coordinates: [number, number] // [longitude, latitude]
  }
  acceptsFlash?: boolean
  redeemTopup?: boolean
  hasRewards?: boolean
  sellsBitcoin?: boolean
  createdAt: Date
  validated: boolean
}
```

## GraphQL Schema Update

### Type Definition
```graphql
type MapMarker {
  username: String!
  mapInfo: MapInfo!
  acceptsFlash: Boolean
  redeemTopup: Boolean
  hasRewards: Boolean
  sellsBitcoin: Boolean
}

type MapInfo {
  title: String!
  coordinates: Coordinates!
}

type Coordinates {
  latitude: Float!
  longitude: Float!
}
```

### Query Response Format
```graphql
query BusinessMapMarkers {
  businessMapMarkers {
    username
    mapInfo {
      title
      coordinates {
        latitude
        longitude
      }
    }
    acceptsFlash
    redeemTopup
    hasRewards
    sellsBitcoin
  }
}
```

## Data Transformation

### Backend Resolver Example
```javascript
const businessMapMarkersResolver = async () => {
  const merchants = await Merchant.find({ validated: true })
  
  return merchants.map(merchant => ({
    username: merchant.username,
    mapInfo: {
      title: merchant.title,
      coordinates: {
        // MongoDB stores as [longitude, latitude]
        // Frontend expects { latitude, longitude }
        latitude: merchant.location.coordinates[1],
        longitude: merchant.location.coordinates[0],
      }
    },
    // Include service badges
    acceptsFlash: merchant.acceptsFlash ?? true, // Default true if not set
    redeemTopup: merchant.redeemTopup ?? false,
    hasRewards: merchant.hasRewards ?? false,
    sellsBitcoin: merchant.sellsBitcoin ?? false,
  }))
}
```

## Migration Strategy

### Step 1: Database Migration
```javascript
// Migration script to add badge fields to existing merchants
async function addBadgeFields() {
  await Merchant.updateMany(
    { acceptsFlash: { $exists: false } },
    { 
      $set: { 
        acceptsFlash: true,  // Assume existing merchants accept Flash
        redeemTopup: false,
        hasRewards: false,
        sellsBitcoin: false
      } 
    }
  )
}
```

### Step 2: Admin Interface Updates
Add controls to manage badge settings:
```javascript
// Admin API endpoint
app.patch('/api/merchants/:id/badges', async (req, res) => {
  const { acceptsFlash, redeemTopup, hasRewards, sellsBitcoin } = req.body
  
  await Merchant.findByIdAndUpdate(
    req.params.id,
    { 
      $set: { 
        acceptsFlash, 
        redeemTopup, 
        hasRewards, 
        sellsBitcoin 
      } 
    }
  )
  
  res.json({ success: true })
})
```

## Testing Badge States

### Test Data Examples
```javascript
// Merchant with all services
{
  username: "premium_merchant",
  title: "Premium Store",
  acceptsFlash: true,
  redeemTopup: true,
  hasRewards: true,
  sellsBitcoin: true
}

// Basic merchant (Flash only)
{
  username: "basic_merchant",
  title: "Basic Store",
  acceptsFlash: true,
  redeemTopup: false,
  hasRewards: false,
  sellsBitcoin: false
}

// Cash services specialist
{
  username: "cash_merchant",
  title: "Cash Exchange",
  acceptsFlash: true,
  redeemTopup: true,
  hasRewards: false,
  sellsBitcoin: true
}
```

## Adding New Badges

To add a new service badge:

1. **Update Backend Schema**:
```javascript
newService: {
  type: Boolean,
  default: false,
  index: true,
}
```

2. **Update GraphQL Schema**:
```graphql
type MapMarker {
  # ... existing fields
  newService: Boolean
}
```

3. **Update Frontend Constants**:
```typescript
const SERVICE_BADGES = [
  // ... existing badges
  {
    key: "newService",
    icon: "new-icon",
    activeStyle: "newServiceIcon",
    label: "🆕 New Service",
    description: "Description of the new service",
  },
]
```

4. **Add Styles**:
```typescript
const useStyles = makeStyles(({ colors }) => ({
  // ... existing styles
  newServiceIcon: {
    color: "#YOUR_COLOR",
  },
}))
```

## Performance Considerations

### Indexing
Add indexes for badge fields if you need to filter by them:
```javascript
MerchantSchema.index({ acceptsFlash: 1, validated: 1 })
MerchantSchema.index({ sellsBitcoin: 1, validated: 1 })
```

### Query Optimization
Filter merchants by services when needed:
```javascript
// Find all Bitcoin exchange locations
const bitcoinExchanges = await Merchant.find({
  validated: true,
  sellsBitcoin: true
})

// Find merchants with rewards programs
const rewardsMerchants = await Merchant.find({
  validated: true,
  hasRewards: true
})
```

## Troubleshooting

### Badges Not Showing
1. Check GraphQL response includes badge fields
2. Verify backend is sending boolean values (not strings)
3. Check for TypeScript type errors

### All Badges Disabled
1. Verify data is being passed correctly from backend
2. Check if `item[badge.key] !== false` logic is correct
3. Look for any frontend overrides

### Performance Issues
1. Ensure MongoDB indexes are created
2. Consider pagination for large merchant lists
3. Use React.memo() for badge components

## Best Practices

1. **Default Values**: Set sensible defaults in the schema
2. **Validation**: Validate boolean values on backend
3. **Caching**: Cache merchant data with appropriate TTL
4. **Monitoring**: Track which services are most/least used
5. **A/B Testing**: Test different badge combinations for user engagement