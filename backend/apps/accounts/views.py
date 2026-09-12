from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.audit.services import record_audit_event

from .serializers import CurrentUserSerializer, LogoutSerializer


class AuditedTokenObtainPairView(TokenObtainPairView):
    serializer_class = TokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            from .models import User

            user = User.objects.filter(email__iexact=request.data.get("email", "")).first()
            record_audit_event(
                action="LOGIN",
                entity="User",
                entity_id=str(user.pk) if user else "",
                user=user,
                request=request,
            )
        return response


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=LogoutSerializer, responses={204: None})
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data["refresh"])
        except TokenError as exc:
            raise ValidationError({"refresh": "Invalid or expired refresh token."}) from exc
        if str(token["user_id"]) != str(request.user.pk):
            raise ValidationError({"refresh": "The refresh token does not belong to this session."})
        token.blacklist()
        record_audit_event(
            action="LOGOUT",
            entity="User",
            entity_id=str(request.user.pk),
            user=request.user,
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=CurrentUserSerializer)
    def get(self, request):
        return Response(CurrentUserSerializer(request.user).data)
