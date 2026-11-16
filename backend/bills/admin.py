from django.contrib import admin

from bills.models import AutoPayRule, Bill, ExtractionCache, LineItem


class LineItemInline(admin.TabularInline):
    model = LineItem
    extra = 0


@admin.register(Bill)
class BillAdmin(admin.ModelAdmin):
    list_display = ["id", "provider", "category", "period_end", "total", "index_type", "status", "source"]
    list_filter = ["provider", "category", "status", "source"]
    inlines = [LineItemInline]


admin.site.register(AutoPayRule)


@admin.register(ExtractionCache)
class ExtractionCacheAdmin(admin.ModelAdmin):
    list_display = ["filename", "file_hash", "created_at"]
