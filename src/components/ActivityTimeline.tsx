import React from 'react';
import {
  Box,
  Typography,
  Chip,
  Stack,
  useTheme,
  Card,
  CardContent,
  Divider,
} from '@mui/material';
import {
  Event as EventIcon,
  PhoneInTalk as PhoneIcon,
  AttachMoney as MoneyIcon,
  LocalShipping as ShippingIcon,
  Visibility as SurveillanceIcon,
  FlightTakeoff as TravelIcon,
  MoreHoriz as OtherIcon,
} from '@mui/icons-material';
import type { Activity, TimelineGroup } from '../types/activity';
import { ActivityType } from '../types/activity';
import { ChangeStatus } from '../types/graph';

interface ActivityTimelineProps {
  timelineGroups: TimelineGroup[];
  onActivityClick?: (activity: Activity) => void;
}

const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ timelineGroups, onActivityClick }) => {
  const theme = useTheme();

  const getActivityIcon = (type: string) => {
    switch (type) {
      case ActivityType.MEETING:
        return <EventIcon />;
      case ActivityType.COMMUNICATION:
        return <PhoneIcon />;
      case ActivityType.TRANSACTION:
        return <MoneyIcon />;
      case ActivityType.SHIPMENT:
        return <ShippingIcon />;
      case ActivityType.SURVEILLANCE:
        return <SurveillanceIcon />;
      case ActivityType.TRAVEL:
        return <TravelIcon />;
      default:
        return <OtherIcon />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case ActivityType.MEETING:
        return theme.palette.mode === 'dark' ? '#42a5f5' : '#1976d2';
      case ActivityType.COMMUNICATION:
        return theme.palette.mode === 'dark' ? '#ab47bc' : '#7b1fa2';
      case ActivityType.TRANSACTION:
        return theme.palette.mode === 'dark' ? '#66bb6a' : '#388e3c';
      case ActivityType.SHIPMENT:
        return theme.palette.mode === 'dark' ? '#ff9800' : '#f57c00';
      case ActivityType.SURVEILLANCE:
        return theme.palette.mode === 'dark' ? '#26c6da' : '#0097a7';
      case ActivityType.TRAVEL:
        return theme.palette.mode === 'dark' ? '#ec407a' : '#c2185b';
      default:
        return theme.palette.mode === 'dark' ? '#78909c' : '#546e7a';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (timelineGroups.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          p: 4,
        }}
      >
        <Typography variant="h6" color="text.secondary">
          No activities found
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      {timelineGroups.map((group, groupIndex) => (
        <Box key={group.date} sx={{ mb: 4 }}>
          {/* Date Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Chip
              label={formatDate(group.date)}
              color="primary"
              sx={{
                fontWeight: 'bold',
                fontSize: '0.875rem',
                height: 32,
              }}
            />
            <Divider sx={{ flex: 1, ml: 2 }} />
          </Box>

          {/* Activities for this date */}
          <Stack spacing={2} sx={{ pl: 2 }}>
            {group.activities.map((activity, activityIndex) => (
              <Box
                key={activity.id}
                sx={{
                  position: 'relative',
                  pl: 4,
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    top: 24,
                    bottom: activityIndex === group.activities.length - 1 ? '100%' : -16,
                    width: 2,
                    bgcolor: theme.palette.divider,
                  },
                }}
              >
                {/* Timeline dot */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: -6,
                    top: 18,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    bgcolor: getActivityColor(activity.type),
                    border: `3px solid ${theme.palette.background.paper}`,
                    zIndex: 1,
                  }}
                />

                {/* Activity Card */}
                <Card
                  sx={{
                    cursor: onActivityClick ? 'pointer' : 'default',
                    transition: 'all 0.2s',
                    border:
                      activity.status === ChangeStatus.NEW
                        ? `2px solid ${theme.palette.success.main}`
                        : `1px solid ${theme.palette.divider}`,
                    '&:hover': onActivityClick
                      ? {
                          transform: 'translateX(4px)',
                          boxShadow: theme.shadows[4],
                        }
                      : {},
                  }}
                  onClick={() => onActivityClick?.(activity)}
                >
                  <CardContent>
                    <Stack spacing={1.5}>
                      {/* Header */}
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <Box
                          sx={{
                            color: getActivityColor(activity.type),
                            mt: 0.5,
                          }}
                        >
                          {getActivityIcon(activity.type)}
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
                            {activity.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatTime(activity.date)}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1}>
                          <Chip
                            label={activity.type}
                            size="small"
                            sx={{
                              bgcolor: getActivityColor(activity.type),
                              color: 'white',
                              fontWeight: 500,
                              fontSize: '0.75rem',
                            }}
                          />
                          {activity.status === ChangeStatus.NEW && (
                            <Chip
                              label="NEW"
                              size="small"
                              color="success"
                              sx={{ fontWeight: 600 }}
                            />
                          )}
                        </Stack>
                      </Box>

                      {/* Description */}
                      <Typography variant="body2" color="text.secondary">
                        {activity.description}
                      </Typography>

                      {/* Location */}
                      {activity.location && (
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                            Location:
                          </Typography>
                          <Typography variant="body2">{activity.location.label}</Typography>
                          {activity.location.address && (
                            <Typography variant="caption" color="text.secondary">
                              {activity.location.address}
                            </Typography>
                          )}
                        </Box>
                      )}

                      {/* Related Entities */}
                      {activity.relatedNodeLabels.length > 0 && (
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                            Related:
                          </Typography>
                          <Box sx={{ mt: 0.5 }}>
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                              {activity.relatedNodeLabels.map((label, idx) => (
                                <Chip
                                  key={idx}
                                  label={label}
                                  size="small"
                                  variant="outlined"
                                  sx={{ fontSize: '0.7rem', height: 22 }}
                                />
                              ))}
                            </Stack>
                          </Box>
                        </Box>
                      )}

                      {/* Metadata */}
                      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        {activity.threatLevel && (
                          <Typography variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
                            Threat: {activity.threatLevel}
                          </Typography>
                        )}
                        {activity.classification && (
                          <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>
                            {activity.classification}
                          </Typography>
                        )}
                        {activity.source && (
                          <Typography variant="caption" color="text.secondary">
                            Source: {activity.source}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Box>
            ))}
          </Stack>

          {/* Show divider between groups except for the last one */}
          {groupIndex < timelineGroups.length - 1 && <Divider sx={{ mt: 4 }} />}
        </Box>
      ))}
    </Box>
  );
};

export default ActivityTimeline;

