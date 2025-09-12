# Monarch Money Export Integration

## Overview
Documentation for exporting Monarch Money data (categories, tags, transactions) via API endpoints for CSV downloads and Custom GPT integration.

## Monarch Money Python API
- **Library**: [monarchmoney](https://github.com/hammem/monarchmoney) - Unofficial Python API for Monarch Money
- **Authentication**: Email/password + MFA secret key required
- **Rate Limits**: Be mindful of API usage limits

## Export Functionality Design

### Endpoints Structure
```
/export/categories    - CSV export of all transaction categories
/export/tags         - CSV export of all transaction tags  
/export/transactions - CSV export of transactions (configurable date range)
/export/all          - JSON export of everything for Custom GPT integration
```

### Data Formats

#### Categories CSV
- id, name, category_group_id, category_group_name, is_income, is_transfer, created_at, updated_at

#### Tags CSV  
- id, name, color, created_at, updated_at

#### Transactions CSV
- id, date, amount, description, merchant, category, category_group, account, tags, is_pending, is_transfer, created_at, updated_at

#### All Data JSON
```json
{
  "categories": [...],
  "tags": [...], 
  "transactions": [...],
  "export_date": "2024-01-15T10:30:00Z",
  "date_range": "2023-10-15 to 2024-01-15"
}
```

## Implementation Requirements

### Dependencies
```
Flask==3.0.0
Flask-CORS==4.0.0
python-dotenv==1.0.0
monarchmoney==0.1.0
```

### Environment Variables
```
MONARCH_EMAIL=your_email@example.com
MONARCH_PASSWORD=your_password
MONARCH_MFA_SECRET=your_mfa_secret_key
API_AUTH=username:password
```

### Authentication Helper
```python
async def get_monarch_client():
    mm = MonarchMoney()
    await mm.login(
        email=email, 
        password=password, 
        mfa_secret_key=mfa_secret,
        save_session=False,
        use_saved_session=False
    )
    return mm
```

### CSV Response Helper
```python
def create_csv_response(data, filename):
    output = io.StringIO()
    if data:
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
    
    response = make_response(output.getvalue())
    response.headers["Content-Type"] = "text/csv"
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response
```

## Usage Examples

### API Calls
```bash
# Export categories
curl -u "username:password" -H "Accept: text/csv" \
  "https://api.theespeys.com/export/categories"

# Export transactions (90 days)
curl -u "username:password" -H "Accept: text/csv" \
  "https://api.theespeys.com/export/transactions?days=90"

# Export all data for Custom GPT
curl -u "username:password" -H "Accept: application/json" \
  "https://api.theespeys.com/export/all?days=90"
```

### Python Integration
```python
import requests

response = requests.get(
    "https://api.theespeys.com/export/all?days=90",
    auth=("username", "password")
)

data = response.json()
# Contains: categories, tags, transactions, export_date, date_range
```

## Script Automation Options

### Individual Scripts
- `export_categories.py` - Categories only
- `export_tags.py` - Tags only  
- `export_transactions.py` - Transactions with date range option
- `export_all.py` - Combined export for Custom GPT

### Batch Export Script
- `export_monarch.sh` - Shell script to export all data types
- Color-coded output with progress indicators
- File size reporting and data summaries

## Custom GPT Integration
The `/export/all` endpoint provides structured JSON perfect for Custom GPT financial analysis:
- Real-time category and tag lists for accurate classification
- Recent transaction history for pattern analysis
- Metadata for context (export date, date range)

## Notes
- **Performance**: Transactions limited to 365 days max for response time
- **File Naming**: Timestamps included for uniqueness
- **Error Handling**: Comprehensive logging and graceful failures
- **Security**: Basic Auth required, MFA for Monarch Money access
