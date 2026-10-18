from rest_framework.exceptions import ValidationError


def ordered(queryset, params, fields, default):
    value = params.get("ordering", default)
    name = value.removeprefix("-")
    if name not in fields:
        raise ValidationError({"ordering": "Choose a supported sort column."})
    field = fields[name]
    return queryset.order_by(("-" if value.startswith("-") else "") + field, "pk")
