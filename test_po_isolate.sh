#!/bin/bash
# Isolated write-path test - bypasses the frontend entirely.
# Run this from Git Bash in your project folder.

curl -s -X POST https://po-db.vercel.app/api/pos \
  -H "Content-Type: application/json" \
  -d '{
    "id": "TEST_ISOLATE_002",
    "orderNo": "TEST/ISOLATE/002",
    "companyName": "TATA STEEL LIMITED",
    "location": "Test",
    "orderDate": "2026-07-17",
    "releaseDate": "2026-07-17",
    "contactPerson": "Test",
    "contactEmail": "test@test.com",
    "vendorCode": "P056",
    "vendorName": "PRECISION SPARES MFG CO",
    "totalOrderValue": 100,
    "currency": "INR",
    "paymentTerm": "Test",
    "deliveryTerms": "Test",
    "status": "Released",
    "complianceChecked": true,
    "items": []
  }'
echo ""
date
