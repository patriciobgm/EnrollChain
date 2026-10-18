from django import forms
from django.contrib.admin.forms import AdminAuthenticationForm
from rest_framework.exceptions import APIException

from .security import authenticate_credentials


class MFAAdminAuthenticationForm(AdminAuthenticationForm):
    code = forms.CharField(
        label="Authentication or recovery code",
        required=False,
        widget=forms.TextInput(attrs={"autocomplete": "one-time-code"}),
    )

    def clean(self):
        email, password = self.cleaned_data.get("username"), self.cleaned_data.get("password")
        if email and password:
            try:
                self.user_cache = authenticate_credentials(
                    self.request, email, password, self.cleaned_data.get("code", "")
                )
                self.user_cache.backend = "django.contrib.auth.backends.ModelBackend"
                self.confirm_login_allowed(self.user_cache)
                if not self.user_cache.is_superuser:
                    raise forms.ValidationError(
                        "Use the school administration workspace for this account."
                    )
            except APIException as exc:
                raise forms.ValidationError(str(exc.detail)) from exc
        return self.cleaned_data
